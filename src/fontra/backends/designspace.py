from functools import cached_property
import logging
import math
import os
from fontTools.designspaceLib import DesignSpaceDocument
from fontTools.misc.transform import Transform
from fontTools.pens.recordingPen import RecordingPointPen
from fontTools.ufoLib import UFOReader
from .ufo_utils import extractGlyphNameAndUnicodes
import watchfiles
from ..core.packedpath import PackedPathPointPen, drawPackedPathToPointPen


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
        self.savedGlyphModificationTimes = {}

    def close(self):
        pass

    @cached_property
    def defaultFontInfo(self):
        fontInfo = UFOFontInfo()
        reader = self.ufoReaders[self.dsDoc.default.path]
        reader.readInfo(fontInfo)
        return fontInfo

    def loadSources(self):
        fontraLayerNames = {}
        self.ufoReaders = {}
        self.ufoGlyphSets = {}
        self.globalSources = []
        self.defaultSourceGlyphSet = None
        makeUniqueStyleName = uniqueNameMaker()
        for sourceIndex, source in enumerate(self.dsDoc.sources):
            sourceStyleName = makeUniqueStyleName(source.styleName)
            path = source.path
            reader = self.ufoReaders.get(path)
            if reader is None:
                reader = self.ufoReaders[path] = UFOReader(path)
            for ufoLayerName in reader.getLayerNames():
                key = (path, ufoLayerName)
                fontraLayerName = fontraLayerNames.get(key)
                if fontraLayerName is None:
                    fontraLayerName = f"{sourceStyleName}/{ufoLayerName}"
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
                name=sourceStyleName,
                layerName=fontraLayerName,
            )
            if source == self.dsDoc.default:
                self.defaultSourceGlyphSet = self.ufoGlyphSets[fontraLayerName]
            self.globalSources.append(sourceDict)

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

    async def putGlyph(self, glyphName, glyph):
        modTimes = set()
        for layer in glyph["layers"]:
            glyphSet = self.ufoGlyphSets[layer["name"]]
            writeUFOLayerGlyph(glyphSet, glyphName, layer["glyph"])
            modTimes.add(round(glyphSet.getGLIFModificationTime(glyphName), 5))
        self.savedGlyphModificationTimes[glyphName] = modTimes

    async def getGlobalAxes(self):
        return self.axes

    async def getUnitsPerEm(self):
        return self.defaultFontInfo.unitsPerEm

    async def getFontLib(self):
        return self.dsDoc.lib

    def watchExternalChanges(self):
        return ufoWatcher(
            sorted(self.ufoReaders),
            self.glifFileNames,
            self.savedGlyphModificationTimes,
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
        self.fontInfo = UFOFontInfo()
        self.reader.readInfo(self.fontInfo)
        self.savedGlyphModificationTimes = {}
        return self

    def close(self):
        pass

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

    async def putGlyph(self, glyphName, glyph):
        modTimes = set()
        for layer in glyph["layers"]:
            glyphSet = self.glyphSets[layer["name"]]
            writeUFOLayerGlyph(glyphSet, glyphName, layer["glyph"])
            modTimes.add(round(glyphSet.getGLIFModificationTime(glyphName), 5))
        self.savedGlyphModificationTimes[glyphName] = modTimes

    async def getGlobalAxes(self):
        return []

    async def getUnitsPerEm(self):
        return self.fontInfo.unitsPerEm

    async def getFontLib(self):
        return self.reader.readLib()

    def watchExternalChanges(self):
        glifFileNames = {
            fileName: glyphName
            for glyphName, fileName in self.glyphSets[self.layerName].contents.items()
        }
        return ufoWatcher([self.path], glifFileNames, self.savedGlyphModificationTimes)


class UFOGlyph:
    unicodes = ()
    width = 0


class UFOFontInfo:
    unitsPerEm = 1000


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
    pen = PackedPathPointPen()
    glyphSet.readGlyph(glyphName, glyph, pen, validate=False)
    path = pen.getPath()
    glyphDict = {}
    glyphDict["path"] = path
    glyphDict["components"] = pen.components
    glyphDict["xAdvance"] = glyph.width
    # TODO: anchors
    # TODO: yAdvance, verticalOrigin
    return glyphDict, glyph


def writeUFOLayerGlyph(glyphSet, glyphName, glyphData):
    layerGlyph = UFOGlyph()
    glyphSet.readGlyph(glyphName, layerGlyph, validate=False)
    pen = RecordingPointPen()
    pathData = glyphData.get("path")
    xAdvance = glyphData.get("xAdvance")
    yAdvance = glyphData.get("yAdvance")
    if xAdvance is not None:
        layerGlyph.width = xAdvance
    if yAdvance is not None:
        layerGlyph.height = yAdvance
    if pathData is not None:
        drawPackedPathToPointPen(pathData, pen)
    for component in glyphData.get("components", ()):
        pen.addComponent(
            component["name"], makeAffineTransform(component["transformation"])
        )
    glyphSet.writeGlyph(
        glyphName, layerGlyph, drawPointsFunc=pen.replay, validate=False
    )


def getReverseCmapFromGlyphSet(glyphSet):
    revCmap = {}
    for glyphName in glyphSet.keys():
        glifData = glyphSet.getGLIF(glyphName)
        gn, unicodes = extractGlyphNameAndUnicodes(glifData)
        assert gn == glyphName, (gn, glyphName)
        revCmap[glyphName] = unicodes
    return revCmap


async def ufoWatcher(ufoPaths, glifFileNames, savedGlyphModificationTimes):
    async for changes in watchfiles.awatch(*ufoPaths):
        glyphNames = set()
        for change, path in changes:
            glyphName = glifFileNames.get(os.path.basename(path))
            if glyphName is not None and round(
                os.stat(path).st_mtime, 5
            ) not in savedGlyphModificationTimes.get(glyphName, ()):
                glyphNames.add(glyphName)
        if glyphNames:
            yield glyphNames


def uniqueNameMaker():
    usedNames = set()

    def makeUniqueName(name):
        count = 0
        uniqueName = name
        while uniqueName in usedNames:
            count += 1
            uniqueName = f"{name}#{count}"
        usedNames.add(uniqueName)
        return uniqueName

    return makeUniqueName


def makeAffineTransform(transformation):
    t = Transform()
    t = t.translate(
        transformation["x"] + transformation["tcenterx"],
        transformation["y"] + transformation["tcentery"],
    )
    t = t.rotate(transformation["rotation"] * (math.pi / 180))
    t = t.scale(transformation["scalex"], transformation["scaley"])
    t = t.translate(-transformation["tcenterx"], -transformation["tcentery"])
    return t
