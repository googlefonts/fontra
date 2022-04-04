import asyncio
import logging
import os
from fontTools.designspaceLib import DesignSpaceDocument
from fontTools.ufoLib import UFOReader
from .ufo_utils import extractGlyphNameAndUnicodes
import watchfiles
from .pen import PathBuilderPointPen


logger = logging.getLogger(__name__)


class DesignspaceBackend:
    @classmethod
    def fromPath(cls, path):
        return cls(DesignSpaceDocument.fromfile(path))

    def __init__(self, dsDoc):
        self.dsDoc = dsDoc
        self.dsDoc.findDefault()
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
        self.buildFileNameMapping()

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
        self.ufoPaths = sorted(readers)

    def buildFileNameMapping(self):
        glifFileNames = {}
        for glyphSet in self.ufoGlyphSets.values():
            for glyphName, fileName in glyphSet.contents.items():
                glifFileNames[fileName] = glyphName
        self.glifFileNames = glifFileNames

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

    def watchExternalChanges(self, glyphsChangedCallback):
        return asyncio.create_task(
            ufoWatcher(self.ufoPaths, self.glifFileNames, glyphsChangedCallback)
        )


class UFOBackend:
    @classmethod
    def fromPath(cls, path):
        self = cls()
        self.path = path
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

    def watchExternalChanges(self, glyphsChangedCallback):
        glifFileNames = {
            fileName: glyphName
            for glyphName, fileName in self.glyphSets[self.layerName].contents.items()
        }
        return asyncio.create_task(
            ufoWatcher([self.path], glifFileNames, glyphsChangedCallback)
        )


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


async def ufoWatcher(ufoPaths, glifFileNames, glyphsChangedCallback):
    async for changes in watchfiles.awatch(*ufoPaths):
        glyphNames = set()
        for change, path in changes:
            glyphName = glifFileNames.get(os.path.basename(path))
            if glyphName is not None:
                glyphNames.add(glyphName)
        if glyphNames:
            try:
                await glyphsChangedCallback(sorted(glyphNames))
            except Exception as e:
                logger.error("error in watchExternalChanges callback: %r", e)
