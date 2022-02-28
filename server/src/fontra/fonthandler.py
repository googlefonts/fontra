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

    def getGlyph(self, glyphName, *, client):
        return self._getGlyph(glyphName)

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
