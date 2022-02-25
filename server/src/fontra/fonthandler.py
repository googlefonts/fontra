class FontHandler:
    def __init__(self, backend, clients):
        self.backend = backend
        self.clients = clients
        self.remoteMethodNames = {
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
        ...

    async def changeSetRollback(self, rollbackChange, *, __client__):
        ...

    async def changeChanging(self, change, *, __client__):
        ...

    async def changeEnd(self, *, __client__):
        ...
