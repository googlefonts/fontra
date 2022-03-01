import asyncio
from collections import defaultdict
import functools


class FontHandler:
    def __init__(self, backend, clients):
        self.backend = backend
        self.clients = clients
        self.remoteMethodNames = {
            "changeBegin",
            "changeSetRollback",
            "changeChanging",
            "changeEnd",
            "getGlyph",
            "getGlyphNames",
            "getReverseCmap",
            "getGlobalAxes",
            "subscribeLiveGlyphChanges",
        }
        self.glyphUsedBy = {}
        self.glyphMadeOf = {}
        self.clientData = defaultdict(dict)
        self.changedGlyphs = {}

    def getGlyph(self, glyphName, *, client):
        glyph = self.changedGlyphs.get(glyphName)
        if glyph is not None:
            fut = asyncio.get_running_loop().create_future()
            fut.set_result(glyph)
            return fut
        return self._getGlyph(glyphName)

    async def getChangedGlyph(self, glyphName):
        glyph = self.changedGlyphs.get(glyphName)
        if glyph is None:
            glyph = await self._getGlyph(glyphName)
            self.changedGlyphs[glyphName] = glyph
        return glyph

    @functools.lru_cache(250)
    def _getGlyph(self, glyphName):
        return asyncio.create_task(self._getGlyphFromBackend(glyphName))

    async def _getGlyphFromBackend(self, glyphName):
        glyphData = await self.backend.getGlyph(glyphName)
        self.updateGlyphDependencies(glyphName, glyphData)
        return glyphData

    async def getGlyphNames(self, *, client):
        return await self.backend.getGlyphNames()

    async def getReverseCmap(self, *, client):
        return await self.backend.getReverseCmap()

    async def getGlobalAxes(self, *, client):
        return await self.backend.getGlobalAxes()

    async def subscribeLiveGlyphChanges(self, glyphNames, *, client):
        self.clientData[client.clientUUID]["subscribedLiveGlyphNames"] = set(glyphNames)

    async def changeBegin(self, *, client):
        ...

    async def changeSetRollback(self, rollbackChange, *, client):
        ...

    async def changeChanging(self, change, *, client):
        await self.updateServerGlyph(change)
        await self.broadcastChange(change, client)

    async def changeEnd(self, *, client):
        return None
        # return {"error": "computer says no"}

    async def broadcastChange(self, change, sourceClient):
        assert change["p"][0] == "glyphs"
        glyphName = change["p"][1]
        clients = []
        for client in self.clients.values():
            subscribedGlyphNames = self.clientData[client.clientUUID].get(
                "subscribedLiveGlyphNames", ()
            )
            if client != sourceClient and glyphName in subscribedGlyphNames:
                clients.append(client)
        await asyncio.gather(
            *[client.proxy.externalChange(change) for client in clients]
        )

    async def updateServerGlyph(self, change):
        assert change["p"][0] == "glyphs"
        glyphName = change["p"][1]
        glyph = await self.getChangedGlyph(glyphName)
        applyChange(dict(glyphs={glyphName: glyph}), change, glyphChangeFunctions)

    def iterGlyphMadeOf(self, glyphName):
        for dependantGlyphName in self.glyphMadeOf.get(glyphName, ()):
            yield dependantGlyphName
            yield from self.iterGlyphMadeOf(dependantGlyphName)

    def iterGlyphUsedBy(self, glyphName):
        for dependantGlyphName in self.glyphUsedBy.get(glyphName, ()):
            yield dependantGlyphName
            yield from self.iterGlyphUsedBy(dependantGlyphName)

    def updateGlyphDependencies(self, glyphName, glyphData):
        # Zap previous used-by data for this glyph, if any
        for componentName in self.glyphMadeOf.get(glyphName, ()):
            if componentName in self.glyphUsedBy:
                self.glyphUsedBy[componentName].discard(glyphName)
        componentNames = set(_iterAllComponentNames(glyphData))
        if componentNames:
            self.glyphMadeOf[glyphName] = componentNames
        elif glyphName in self.glyphMadeOf:
            del self.glyphMadeOf[glyphName]
        for componentName in componentNames:
            if componentName not in self.glyphUsedBy:
                self.glyphUsedBy[componentName] = set()
            self.glyphUsedBy[componentName].add(glyphName)


def _iterAllComponentNames(glyphData):
    for source in glyphData["sources"]:
        for layer in source["layers"]:
            for compo in layer["glyph"].get("components", ()):
                yield compo["name"]


def setPointPosition(path, pointIndex, x, y):
    coords = path["coordinates"]
    i = pointIndex * 2
    coords[i] = x
    coords[i + 1] = y


def setItem(subject, key, value):
    subject[key] = value


glyphChangeFunctions = {
  "=xy": setPointPosition,
  "=": setItem,
}


#
# A "change" object is a simple JS object containing several
# keys.
#
# "p": an array of path items, eg. ["glyphs", "Aring"]
# Optional: can be omitted if empty.
#
# "f": function name, to be lookud up in the changeFunctions dict
# Optional: can be omitted if the change has children
#
# "k": a key or index into the "subject"
#
# "v": "value", a single argument for the change function
# "a": "arguments", an array of arguments for the change function
# If the change has a change function ("f" key), it MUST also have
# a "v" key/value or an "a" key/value, but NOT both
#
# "c": Array of child changes. Optional.
#


def applyChange(subject, change, changeFunctions):
  path = change.get("p", [])
  functionName = change.get("f")
  children = change.get("c", [])

  for pathElement in path:
    subject = subject[pathElement]

  if functionName is not None:
    changeFunc = changeFunctions[functionName]
    arg = change.get("v")
    args = change.get("a")
    if arg is not None:
      changeFunc(subject, change["k"], arg)
    else:
      changeFunc(subject, change["k"], *args)

  for subChange in children:
    applyChange(subject, subChange, changeFunctions)
