class FontHandler:
    def __init__(self, backend):
        self.backend = backend
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

    async def changeBegin(self):
        ...

    async def changeSetRollback(self, rollbackChange):
        ...

    async def changeChanging(self, change):
        ...

    async def changeEnd(self):
        ...
