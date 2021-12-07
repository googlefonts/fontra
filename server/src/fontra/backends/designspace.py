from fontTools.designspaceLib import DesignSpaceDocument
from fontTools.ufoLib import UFOReader
from rcjktools.project import extractGlyphNameAndUnicodes
from .pen import PathBuilderPointPen


class DesignspaceBackend:
    def __init__(self, path):
        self.dsDoc = DesignSpaceDocument.fromfile(path)
        self.dsDoc.findDefault()
        self._sources = {}
        self.axes = [
            {
                "minValue": axis.minimum,
                "defaultValue": axis.default,
                "maxValue": axis.maximum,
                "name": axis.name,
            }
            for axis in self.dsDoc.axes
        ]

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

    async def getGlyph(self, glyphName):
        glyph = {"axes": self.axes, "name": glyphName}
        sources = []
        for sourceDescriptor in self.dsDoc.sources:
            ufoSource = self._getSourceFromSourceDescriptor(sourceDescriptor)
            if not ufoSource.hasGlyph(glyphName):
                continue
            location = sourceDescriptor.location
            sourceDict, sourceGlyph = ufoSource.serializeGlyph(glyphName)
            sources.append(
                {
                    "location": sourceDescriptor.location,
                    "source": sourceDict,
                }
            )
            if ufoSource == self.defaultSource:
                glyph["unicodes"] = sourceGlyph.unicodes

        glyph["sources"] = sources
        return glyph


class UFOSource:
    def __init__(self, path, layerName):
        self.reader = UFOReader(path)
        self.glyphSet = self.reader.getGlyphSet(layerName=layerName)

    def serializeGlyph(self, glyphName):
        glyph = UFOGlyph()
        pen = PathBuilderPointPen()
        self.glyphSet.readGlyph(glyphName, glyph, pen, validate=False)
        path = pen.getPath()
        glyphDict = {}
        if path is not None:
            glyphDict["path"] = path
        if pen.components:
            glyphDict["components"] = pen.components
        glyphDict["hAdvance"] = glyph.width
        # TODO: components
        # TODO: anchors
        # TODO: vAdvance, verticalOrigin
        return glyphDict, glyph

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


class UFOGlyph:
    unicodes = ()
    width = 0
