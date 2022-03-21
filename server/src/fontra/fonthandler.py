import asyncio
from collections import defaultdict
import functools
from .changes import applyChange, baseChangeFunctions


class FontHandler:
    def __init__(self, backend, clients, authorizeTokenFunc):
        self.backend = backend
        self.clients = clients
        self.remoteMethodNames = {
            "changeBegin",
            "changeSetRollback",
            "changeChanging",
            "changeEnd",
            "getGlyph",
            "unloadGlyph",
            "getGlyphNames",
            "getReverseCmap",
            "getGlobalAxes",
            "subscribeLiveGlyphChanges",
        }
        self.glyphUsedBy = {}
        self.glyphMadeOf = {}
        self.clientData = defaultdict(dict)
        self.changedGlyphs = {}
        self.authorizeTokenFunc = authorizeTokenFunc

    def authorizeToken(self, token, remoteIP):
        return self.authorizeTokenFunc(token, remoteIP)

    def getGlyph(self, glyphName, *, client):
        loadedGlyphNames = self.clientData[client.clientUUID].setdefault(
            "loadedGlyphNames", set()
        )
        loadedGlyphNames.add(glyphName)
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

    async def unloadGlyph(self, glyphName, *, client):
        loadedGlyphNames = self.clientData[client.clientUUID]["loadedGlyphNames"]
        loadedGlyphNames.discard(glyphName)

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

    async def changeChanging(self, liveChange, *, client):
        await self.broadcastChange(liveChange, client, True)

    async def changeEnd(self, finalChange, *, client):
        if finalChange is None:
            return
        await self.updateServerGlyph(finalChange)
        await self.broadcastChange(finalChange, client, False)
        # return {"error": "computer says no"}

    async def broadcastChange(self, change, sourceClient, isLiveChange):
        if isLiveChange:
            subscribedGlyphNamesKey = "subscribedLiveGlyphNames"
        else:
            subscribedGlyphNamesKey = "loadedGlyphNames"
        assert change["p"][0] == "glyphs"
        glyphName = change["p"][1]
        clients = []
        for client in self.clients.values():
            subscribedGlyphNames = self.clientData[client.clientUUID].get(
                subscribedGlyphNamesKey, ()
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
    for layer in glyphData["layers"]:
        for compo in layer["glyph"].get("components", ()):
            yield compo["name"]


def setPointPosition(path, pointIndex, x, y):
    coords = path["coordinates"]
    i = pointIndex * 2
    coords[i] = x
    coords[i + 1] = y


glyphChangeFunctions = {
    "=xy": setPointPosition,
}


glyphChangeFunctions.update(baseChangeFunctions)
