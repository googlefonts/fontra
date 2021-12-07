from fontTools.designspaceLib import DesignSpaceDocument
from fontTools.ufoLib import UFOReader
from rcjktools.project import extractGlyphNameAndUnicodes


class DesignspaceBackend:
    def __init__(self, path):
        self.dsDoc = DesignSpaceDocument.fromfile(path)
        self.dsDoc.findDefault()
        self._sources = {}

    @property
    def defaultSource(self):
        return self._getSource(self.dsDoc.default.path)

    def _getSource(self, path):
        src = self._sources.get(path)
        if src is None:
            src = UFOSource(path)
        self._sources[path] = src
        return src

    async def getGlyphNames(self):
        return self.defaultSource.getGlyphNames()

    async def getReversedCmap(self):
        return self.defaultSource.getReversedCmap()


class UFOSource:
    def __init__(self, path):
        self.reader = UFOReader(path)
        self.glyphSet = self.reader.getGlyphSet()

    def getGlyphNames(self):
        return sorted(self.glyphSet.keys())

    def getReversedCmap(self):
        revCmap = {}
        for glyphName in self.getGlyphNames():
            glifData = self.glyphSet.getGLIF(glyphName)
            gn, unicodes = extractGlyphNameAndUnicodes(glifData)
            assert gn == glyphName
            revCmap[glyphName] = unicodes
        return revCmap
