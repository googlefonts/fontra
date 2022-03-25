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
        readers = {}
        fontraLayerNames = {}
        self.ufoGlyphSets = {}
        self.globalSources = []
        self.defaultSourceGlyphSet = None
        for sourceIndex, source in enumerate(self.dsDoc.sources):
            path = source.path
            reader = readers.get(path)
            if reader is None:
                reader = readers[path] = UFOReader(path)
            for ufoLayerName in reader.getLayerNames():
                key = (path, ufoLayerName)
                fontraLayerName = fontraLayerNames.get(key)
                if fontraLayerName is None:
                    fontraLayerName = f"{source.styleName}/{ufoLayerName}"
                    fontraLayerNames[key] = fontraLayerName
                    self.ufoGlyphSets[fontraLayerName] = reader.getGlyphSet(
                        ufoLayerName
                    )
            sourceLayerName = (
                source.layerName
                if source.layerName is not None
                else reader.getDefaultLayerName()
            )
            fontraLayerName = fontraLayerNames[(path, sourceLayerName)]
            sourceDict = dict(
                location=source.location,
                name=source.styleName,
                layerName=fontraLayerName,
            )
            if source == self.dsDoc.default:
                self.defaultSourceGlyphSet = self.ufoGlyphSets[fontraLayerName]
            self.globalSources.append(sourceDict)

    async def getReverseCmap(self):
        return getReverseCmapFromGlyphSet(self.defaultSourceGlyphSet)

    async def getGlyph(self, glyphName):
        glyph = {"name": glyphName, "unicodes": []}

        sources = []
        for globalSource in self.globalSources:
            glyphSet = self.ufoGlyphSets[globalSource["layerName"]]
            if glyphName not in glyphSet:
                continue
            sources.append(dict(globalSource))
        glyph["sources"] = sources

        layers = []
        for fontraLayerName, glyphSet in self.ufoGlyphSets.items():
            if glyphName not in glyphSet:
                continue
            glyphDict, ufoGlyph = serializeGlyph(glyphSet, glyphName)
            if glyphSet == self.defaultSourceGlyphSet:
                glyph["unicodes"] = ufoGlyph.unicodes
            layers.append({"name": fontraLayerName, "glyph": glyphDict})
        glyph["layers"] = layers

        return glyph

    async def getGlobalAxes(self):
        return self.axes


class UFOBackend:
    @classmethod
    def fromPath(cls, path):
        self = cls()
        self.reader = UFOReader(path)
        self.layerName = self.reader.getDefaultLayerName()
        self.glyphSets = {
            layerName: self.reader.getGlyphSet(layerName=layerName)
            for layerName in self.reader.getLayerNames()
        }
        return self

    async def getReverseCmap(self):
        return getReverseCmapFromGlyphSet(self.glyphSets[self.layerName])

    def hasGlyph(self, glyphName):
        return glyphName in self.glyphSets[self.layerName]

    async def getGlyph(self, glyphName):
        glyph = {"name": glyphName}
        layers, sourceGlyph = serializeGlyphLayers(
            self.glyphSets, glyphName, self.layerName
        )
        layerName = self.layerName
        glyph["sources"] = [
            {
                "location": {},
                "layerName": self.layerName,
            }
        ]
        glyph["unicodes"] = sourceGlyph.unicodes
        glyph["layers"] = layers
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


def getReverseCmapFromGlyphSet(glyphSet):
    revCmap = {}
    for glyphName in glyphSet.keys():
        glifData = glyphSet.getGLIF(glyphName)
        gn, unicodes = extractGlyphNameAndUnicodes(glifData)
        assert gn == glyphName
        revCmap[glyphName] = unicodes
    return revCmap
