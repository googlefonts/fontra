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
        return self._getSourceFromSourceDescriptor(self.dsDoc.default)

    def _getSourceFromSourceDescriptor(self, source):
        path = source.path
        layerName = source.layerName
        key = (path, layerName)
        src = self._sources.get(key)
        if src is None:
            src = UFOSource(path, layerName)
        self._sources[key] = src
        return src

    async def getGlyphNames(self):
        return self.defaultSource.getGlyphNames()

    async def getReversedCmap(self):
        return self.defaultSource.getReversedCmap()


class UFOSource:
    def __init__(self, path, layerName):
        self.reader = UFOReader(path)
        self.glyphSet = self.reader.getGlyphSet(layerName=layerName)

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

    def hasGlyph(self, glyphName):
        return glyphName in self.glyphSet
