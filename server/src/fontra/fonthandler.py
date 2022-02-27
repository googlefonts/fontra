import asyncio
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
            "subscribeGlyphChanges",
        }

    def getGlyph(self, glyphName, *, client):
        return self._getGlyph(glyphName)

    @functools.lru_cache(250)
    def _getGlyph(self, glyphName):
        return asyncio.create_task(self.backend.getGlyph(glyphName))

    async def getGlyphNames(self, *, client):
        return await self.backend.getGlyphNames()

    async def getReverseCmap(self, *, client):
        return await self.backend.getReverseCmap()

    async def getGlobalAxes(self, *, client):
        return await self.backend.getGlobalAxes()

    async def subscribeGlyphChanges(self, glyphNames, *, client):
        client.data["subscribedGlyphNames"] = set(glyphNames)

    async def changeBegin(self, *, client):
        ...

    async def changeSetRollback(self, rollbackChange, *, client):
        ...

    async def changeChanging(self, change, *, client):
        await self.broadcastChange(change, client)

    async def changeEnd(self, *, client):
        ...

    async def broadcastChange(self, change, sourceClient):
        assert change["p"][0] == "glyphs"
        glyphName = change["p"][1]
        coros = []
        for client in self.clients.values():
            if client != sourceClient:  # and glyphName in client.data.get("subscribedGlyphNames", ())
                coros.append(client.proxy.externalChange(change))
        await asyncio.gather(*coros)
