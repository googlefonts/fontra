from collections import defaultdict
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
        axes = []
        for axis in self.dsDoc.axes:
            axisDict = {
                "minValue": axis.minimum,
                "defaultValue": axis.default,
                "maxValue": axis.maximum,
                "name": axis.name,
            }
            if axis.map:
                axisDict["mapping"] = [[a, b] for a, b in axis.map]
            axes.append(axisDict)
        self.axes = axes
        self.loadSources()
        return self

    @property
    def defaultSource(self):
        return self._getSourceFromSourceDescriptor(self.dsDoc.default)

    def loadSources(self):
        # All layers in a source UFO that are NOT used as source layer
        # by the designspace doc are added to the default source.
        readers = {}
        sourceLayers = defaultdict(set)
        for source in self.dsDoc.sources:
            path = source.path
            reader = readers.get(path)
            if reader is None:
                reader = readers[path] = UFOReader(path)
            sourceLayers[path].add(source.layerName or reader.getDefaultLayerName())

        for source in self.dsDoc.sources:
            path = source.path
            layerName = source.layerName
            reader = readers[path]
            usedLayerNames = sourceLayers[path]
            if layerName is None:
                layerName = reader.getDefaultLayerName()
                layerNames = [
                    n
                    for n in reader.getLayerNames()
                    if n == layerName or n not in usedLayerNames
                ]
            else:
                layerNames = [layerName]
            key = (path, source.layerName)
            assert key not in self._sources
            self._sources[key] = UFOBackend.fromUFOReader(reader, layerName, layerNames)

    def _getSourceFromSourceDescriptor(self, source):
        return self._sources[(source.path, source.layerName)]

    async def getGlyphNames(self):
        return await self.defaultSource.getGlyphNames()

    async def getReversedCmap(self):
        return await self.defaultSource.getReversedCmap()

    async def getGlyph(self, glyphName):
        glyph = {"name": glyphName}
        sources = []
        for sourceDescriptor in self.dsDoc.sources:
            ufoSource = self._getSourceFromSourceDescriptor(sourceDescriptor)
            if not ufoSource.hasGlyph(glyphName):
                continue
            layersDict, sourceGlyph = ufoSource.serializeGlyph(glyphName)
            sources.append(
                {
                    "name": sourceDescriptor.layerName or sourceDescriptor.styleName,
                    "location": sourceDescriptor.location,
                    "sourceLayerName": ufoSource.layerName,
                    "layers": layersDict,
                }
            )
            if ufoSource == self.defaultSource:
                glyph["unicodes"] = sourceGlyph.unicodes

        glyph["sources"] = sources
        return glyph

    async def getGlobalAxes(self):
        return self.axes


class UFOBackend:
    @classmethod
    def fromPath(cls, path, layerName=None, layerNames=None):
        return cls.fromUFOReader(UFOReader(path), layerName, layerNames)

    @classmethod
    def fromUFOReader(cls, reader, layerName=None, layerNames=None):
        self = cls()
        self.reader = reader
        if layerName is None:
            layerName = self.reader.getDefaultLayerName()
        self.layerName = layerName
        if layerNames is None:
            layerNames = self.reader.getLayerNames()
        self.glyphSets = {
            layerName: self.reader.getGlyphSet(layerName=layerName)
            for layerName in layerNames
        }
        return self

    def serializeGlyph(self, glyphName):
        return serializeGlyphLayers(self.glyphSets, glyphName, self.layerName)

    async def getGlyphNames(self):
        return sorted(self.glyphSets[self.layerName].keys())

    async def getReversedCmap(self):
        revCmap = {}
        for glyphName in await self.getGlyphNames():
            glifData = self.glyphSets[self.layerName].getGLIF(glyphName)
            gn, unicodes = extractGlyphNameAndUnicodes(glifData)
            assert gn == glyphName
            revCmap[glyphName] = unicodes
        return revCmap

    def hasGlyph(self, glyphName):
        return glyphName in self.glyphSets[self.layerName]

    async def getGlyph(self, glyphName):
        glyph = {"name": glyphName}
        layersDict, sourceGlyph = self.serializeGlyph(glyphName)
        layerName = self.layerName
        glyph["sources"] = [
            {
                "location": {},
                "sourceLayerName": self.layerName,
                "layers": layersDict,
            }
        ]
        glyph["unicodes"] = sourceGlyph.unicodes
        return glyph

    async def getGlobalAxes(self):
        return []


class UFOGlyph:
    unicodes = ()
    width = 0


def serializeGlyphLayers(glyphSets, glyphName, sourceLayerName):
    layers = []
    sourceLayerGlyph = None
    for layerName, glyphSet in glyphSets.items():
        if glyphName in glyphSet:
            glyphDict, glyph = serializeGlyph(glyphSet, glyphName)
            layers.append({"name": layerName, "glyph": glyphDict})
            if layerName == sourceLayerName:
                sourceLayerGlyph = glyph
    return layers, sourceLayerGlyph


def serializeGlyph(glyphSet, glyphName):
    glyph = UFOGlyph()
    pen = PathBuilderPointPen()
    glyphSet.readGlyph(glyphName, glyph, pen, validate=False)
    path = pen.getPath()
    glyphDict = {}
    if path is not None:
        glyphDict["path"] = path
    if pen.components:
        glyphDict["components"] = pen.components
    glyphDict["xAdvance"] = glyph.width
    # TODO: anchors
    # TODO: yAdvance, verticalOrigin
    return glyphDict, glyph
