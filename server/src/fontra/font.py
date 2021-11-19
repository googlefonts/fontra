class FontServer:
    def __init__(self, backend):
        self.backend = backend

    async def remote_getGlyphNames(self):
        return sorted(await self.backend.getGlyphNames())

    async def remote_getGlyph(self, glyphName):
        return await self.backend.getGlyph(glyphName)
