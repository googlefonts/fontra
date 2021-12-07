from fontTools.designspaceLib import DesignSpaceDocument
from fontTools.ufoLib import UFOReader
from rcjktools.project import extractGlyphNameAndUnicodes
from .pen import PathBuilderPointPen


class DesignspaceBackend:
    @classmethod
    def fromPath(cls, path):
        self = cls()
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
        return self

    @property
    def defaultSource(self):
        return self._getSourceFromSourceDescriptor(self.dsDoc.default)

    def _getSourceFromSourceDescriptor(self, source):
        path = source.path
        layerName = source.layerName
        key = (path, layerName)
        src = self._sources.get(key)
        if src is None:
            src = UFOBackend.fromPath(path, layerName)
        self._sources[key] = src
        return src

    async def getGlyphNames(self):
        return await self.defaultSource.getGlyphNames()

    async def getReversedCmap(self):
        return await self.defaultSource.getReversedCmap()

    async def getGlyph(self, glyphName):
        glyph = {"axes": self.axes, "name": glyphName}
        sources = []
        for sourceDescriptor in self.dsDoc.sources:
            ufoSource = self._getSourceFromSourceDescriptor(sourceDescriptor)
            if not ufoSource.hasGlyph(glyphName):
                continue
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


class UFOBackend:
    @classmethod
    def fromPath(cls, path, layerName=None):
        self = cls()
        self.reader = UFOReader(path)
        self.glyphSet = self.reader.getGlyphSet(layerName=layerName)
        return self

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

    async def getGlyphNames(self):
        return sorted(self.glyphSet.keys())

    async def getReversedCmap(self):
        revCmap = {}
        for glyphName in await self.getGlyphNames():
            glifData = self.glyphSet.getGLIF(glyphName)
            gn, unicodes = extractGlyphNameAndUnicodes(glifData)
            assert gn == glyphName
            revCmap[glyphName] = unicodes
        return revCmap

    def hasGlyph(self, glyphName):
        return glyphName in self.glyphSet

    async def getGlyph(self, glyphName):
        glyph = {"name": glyphName}
        sourceDict, sourceGlyph = self.serializeGlyph(glyphName)
        glyph["sources"] = [
            {
                "location": {},
                "source": sourceDict,
            }
        ]
        glyph["unicodes"] = sourceGlyph.unicodes
        return glyph


class UFOGlyph:
    unicodes = ()
    width = 0
