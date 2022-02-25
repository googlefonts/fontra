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
        }

    async def getGlyph(self, glyphName, *, __client__):
        return await self.backend.getGlyph(glyphName)

    async def getGlyphNames(self, *, __client__):
        return await self.backend.getGlyphNames()

    async def getReverseCmap(self, *, __client__):
        return await self.backend.getReverseCmap()

    async def getGlobalAxes(self, *, __client__):
        return await self.backend.getGlobalAxes()

    async def changeBegin(self, *, __client__):
        await self.broadcastMessage({"msg": "hello world"}, __client__)

    async def changeSetRollback(self, rollbackChange, *, __client__):
        ...

    async def changeChanging(self, change, *, __client__):
        ...

    async def changeEnd(self, *, __client__):
        ...

    async def broadcastMessage(self, message, excludeClient):
        for client in self.clients.values():
            if client != excludeClient:
                await client.sendMessage(message)
