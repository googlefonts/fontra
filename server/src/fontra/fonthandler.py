class FontHandler:
    def __init__(self, backend):
        self.backend = backend
        self.remoteMethodNames = {
            "getGlyph",
            "getGlyphNames",
            "getReverseCmap",
            "getGlobalAxes",
        }

    def __getattr__(self, attrName):
        if attrName in self.remoteMethodNames:
            return getattr(self.backend, attrName)
        return super().__getattr__(attrName)
