from fontTools.designspaceLib import DesignSpaceDocument
from fontTools.ufoLib import UFOReader


class DesignspaceBackend:
    def __init__(self, path):
        self.dsDoc = DesignSpaceDocument.fromfile(path)
        self.dsDoc.findDefault()
        self._sources = {}

    def _getSource(self, path):
        src = self._sources.get(path)
        if src is None:
            src = UFOSource(path)
        self._sources[path] = src
        return src

    async def getGlyphNames(self):
        src = self._getSource(self.dsDoc.default.path)
        return src.getGlyphNames()


class UFOSource:
    def __init__(self, path):
        self.reader = UFOReader(path)

    def getGlyphNames(self):
        gs = self.reader.getGlyphSet()
        return sorted(gs.keys())
