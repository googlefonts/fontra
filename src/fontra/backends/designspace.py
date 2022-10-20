from __future__ import annotations

from dataclasses import asdict
from datetime import datetime
from functools import cached_property
import logging
import math
import os
from fontTools.designspaceLib import DesignSpaceDocument
from fontTools.misc.transform import Transform
from fontTools.pens.recordingPen import RecordingPointPen
from fontTools.ufoLib import UFOReader
from fontTools.ufoLib.glifLib import GlyphSet
from .ufo_utils import extractGlyphNameAndUnicodes
import watchfiles
from ..core.classes import (
    Component,
    Layer,
    StaticGlyph,
    Source,
    Transformation,
    VariableGlyph,
)
from ..core.packedpath import PackedPathPointPen


logger = logging.getLogger(__name__)


VARIABLE_COMPONENTS_LIB_KEY = "com.black-foundry.variable-components"


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
        glyph = VariableGlyph(glyphName)

        sources = []
        for globalSource in self.globalSources:
            glyphSet = self.ufoGlyphSets[globalSource["layerName"]]
            if glyphName not in glyphSet:
                continue
            sources.append(Source(**globalSource))
        glyph.sources = sources

        layers = []
        for fontraLayerName, glyphSet in self.ufoGlyphSets.items():
            if glyphName not in glyphSet:
                continue
            staticGlyph, ufoGlyph = serializeGlyph(glyphSet, glyphName)
            if glyphSet == self.defaultSourceGlyphSet:
                glyph.unicodes = list(ufoGlyph.unicodes)
            layers.append(Layer(fontraLayerName, staticGlyph))
        glyph.layers = layers

        return glyph

    async def putGlyph(self, glyphName, glyph):
        modTimes = set()
        for layer in glyph.layers:
            glyphSet = self.ufoGlyphSets[layer.name]
            writeUFOLayerGlyph(glyphSet, glyphName, layer.glyph)
            modTimes.add(glyphSet.getGLIFModificationTime(glyphName))
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
        glyph = VariableGlyph(glyphName)
        layers, sourceGlyph = serializeGlyphLayers(
            self.glyphSets, glyphName, self.layerName
        )
        glyph.sources = [
            Source(name=self.layerName, location={}, layerName=self.layerName)
        ]
        glyph.unicodes = list(sourceGlyph.unicodes)
        glyph.layers = layers
        return glyph

    async def putGlyph(self, glyphName, glyph):
        modTimes = set()
        for layer in glyph.layers:
            glyphSet = self.glyphSets[layer.name]
            writeUFOLayerGlyph(glyphSet, glyphName, layer.glyph)
            modTimes.add(glyphSet.getGLIFModificationTime(glyphName))
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
            layers.append(Layer(name=layerName, glyph=glyphDict))
            if layerName == sourceLayerName:
                sourceLayerGlyph = glyph
    return layers, sourceLayerGlyph


def serializeGlyph(glyphSet, glyphName):
    glyph = UFOGlyph()
    glyph.lib = {}
    pen = PackedPathPointPen()
    glyphSet.readGlyph(glyphName, glyph, pen, validate=False)
    components = [*pen.components] + unpackVariableComponents(glyph.lib)
    staticGlyph = StaticGlyph(
        path=pen.getPath(), components=components, xAdvance=glyph.width
    )
    # TODO: anchors
    # TODO: yAdvance, verticalOrigin
    return staticGlyph, glyph


def unpackVariableComponents(lib):
    components = []
    for componentDict in lib.get(VARIABLE_COMPONENTS_LIB_KEY, ()):
        glyphName = componentDict["base"]
        transformationDict = componentDict.get("transformation", {})
        transformation = Transformation(**transformationDict)
        location = componentDict.get("location", {})
        components.append(Component(glyphName, transformation, location))
    return components


def writeUFOLayerGlyph(glyphSet: GlyphSet, glyphName: str, glyph: StaticGlyph) -> None:
    layerGlyph = UFOGlyph()
    layerGlyph.lib = {}
    glyphSet.readGlyph(glyphName, layerGlyph, validate=False)
    pen = RecordingPointPen()
    layerGlyph.width = glyph.xAdvance
    layerGlyph.height = glyph.yAdvance
    glyph.path.drawPoints(pen)
    variableComponents = []
    for component in glyph.components:
        if not component.location:
            pen.addComponent(
                component.name,
                cleanAffine(makeAffineTransform(component.transformation)),
            )
        else:
            varCoDict = {"base": component.name, "location": component.location}
            if component.transformation != Transformation():
                varCoDict["transformation"] = asdict(component.transformation)
            variableComponents.append(varCoDict)

    if variableComponents:
        layerGlyph.lib[VARIABLE_COMPONENTS_LIB_KEY] = variableComponents
    else:
        layerGlyph.lib.pop(VARIABLE_COMPONENTS_LIB_KEY, None)

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
            if glyphName is None:
                continue
            mtime = os.stat(path).st_mtime
            # Round-trip through datetime, as that's effectively what is happening
            # in getGLIFModificationTime, deep down in the fs package. It makes sure
            # we're comparing timestamps that are actually comparable, as they're
            # rounded somewhat, compared to the raw st_mtime timestamp.
            mtime = datetime.fromtimestamp(mtime).timestamp()
            savedMTimes = savedGlyphModificationTimes.get(glyphName, ())
            if mtime not in savedMTimes:
                logger.info(
                    f"external change '{glyphName}' {mtime} "
                    f"{savedMTimes} {mtime in savedMTimes}"
                )
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


def makeAffineTransform(transformation: Transformation) -> Transform:
    t = Transform()
    t = t.translate(
        transformation.translateX + transformation.tCenterX,
        transformation.translateY + transformation.tCenterY,
    )
    t = t.rotate(transformation.rotation * (math.pi / 180))
    t = t.scale(transformation.scaleX, transformation.scaleY)
    t = t.skew(
        -transformation.skewX * (math.pi / 180), transformation.skewY * (math.pi / 180)
    )
    t = t.translate(-transformation.tCenterX, -transformation.tCenterY)
    return t


def cleanAffine(t):
    """Convert any integer float values into ints. This is to prevent glifLib
    from writing float values that can be integers."""
    return tuple(int(v) if int(v) == v else v for v in t)
