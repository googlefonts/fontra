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
    LocalAxis,
    StaticGlyph,
    Source,
    Transformation,
    VariableGlyph,
)
from ..core.packedpath import PackedPathPointPen


logger = logging.getLogger(__name__)


VARIABLE_COMPONENTS_LIB_KEY = "com.black-foundry.variable-components"
GLYPH_DESIGNSPACE_LIB_KEY = "com.black-foundry.glyph-designspace"


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
        self.glyphMap = getGlyphMapFromGlyphSet(self.defaultSourceGlyphSet)
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
        self.ufoReaders = {}  # keyed by path
        self.ufoGlyphSets = {}  # keyed by fontraLayerName
        self.fontraLayerNames = {}  # key: (path, ufoLayerName), value: fontraLayerName
        self.ufoLayers = {}  # key: fontraLayerName, value: (path, ufoLayerName)
        self.globalSources = []
        self.defaultSourceGlyphSet = None
        makeUniqueStyleName = uniqueNameMaker()
        for sourceIndex, source in enumerate(self.dsDoc.sources):
            sourceStyleName = makeUniqueStyleName(source.styleName or "default")
            path = source.path
            reader = self.ufoReaders.get(path)
            if reader is None:
                reader = self.ufoReaders[path] = UFOReader(path)
            for ufoLayerName in reader.getLayerNames():
                key = (path, ufoLayerName)
                fontraLayerName = self.fontraLayerNames.get(key)
                if fontraLayerName is None:
                    fontraLayerName = f"{sourceStyleName}/{ufoLayerName}"
                    self.fontraLayerNames[key] = fontraLayerName
                    self.ufoLayers[fontraLayerName] = key
                    self.ufoGlyphSets[fontraLayerName] = reader.getGlyphSet(
                        ufoLayerName
                    )
            sourceLayerName = (
                source.layerName
                if source.layerName is not None
                else reader.getDefaultLayerName()
            )
            fontraLayerName = self.fontraLayerNames[(path, sourceLayerName)]
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

    def updateGlyphSetContents(self, glyphSet):
        glyphSet.writeContents()
        glifFileNames = self.glifFileNames
        for glyphName, fileName in glyphSet.contents.items():
            glifFileNames[fileName] = glyphName

    async def getGlyphMap(self):
        return self.glyphMap

    async def getGlyph(self, glyphName):
        if glyphName not in self.glyphMap:
            return None

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
            staticGlyph, ufoGlyph = serializeStaticGlyph(glyphSet, glyphName)
            if glyphSet == self.defaultSourceGlyphSet:
                localDS = ufoGlyph.lib.get(GLYPH_DESIGNSPACE_LIB_KEY)
                if localDS is not None:
                    glyph.axes, glyph.sources = self._unpackLocalDesignSpace(
                        localDS, *self.ufoLayers[fontraLayerName]
                    )
            layers.append(Layer(fontraLayerName, staticGlyph))
        glyph.layers = layers

        return glyph

    def _unpackLocalDesignSpace(self, dsDict, ufoPath, ufoLayerName):
        axes = [
            LocalAxis(
                name=axis["name"],
                minValue=axis["minimum"],
                defaultValue=axis["default"],
                maxValue=axis["maximum"],
            )
            for axis in dsDict["axes"]
        ]
        sources = []
        for source in dsDict["sources"]:
            fileName = source.get("filename")
            if fileName is not None:
                raise NotImplemented
                # ufoPath = ...
            ufoLayerName = source.get("layername", ufoLayerName)
            fontraLayerName = self.fontraLayerNames[ufoPath, ufoLayerName]
            sources.append(
                Source(
                    name=fontraLayerName,
                    location=source["location"],
                    layerName=fontraLayerName,
                )
            )
        return axes, sources

    async def putGlyph(self, glyphName, glyph):
        modTimes = set()
        unicodes = self.glyphMap.get(glyphName, [])
        for layer in glyph.layers:
            glyphSet = self.ufoGlyphSets[layer.name]
            writeGlyphSetContents = glyphName not in glyphSet
            layerGlyph, drawPointsFunc = buildUFOLayerGlyph(
                glyphSet, glyphName, layer.glyph, unicodes
            )
            if glyphSet == self.defaultSourceGlyphSet:
                localDS = self._packLocalDesignSpace(glyph)
                if localDS:
                    layerGlyph.lib[GLYPH_DESIGNSPACE_LIB_KEY] = localDS
                else:
                    layerGlyph.lib.pop(GLYPH_DESIGNSPACE_LIB_KEY, None)

            glyphSet.writeGlyph(
                glyphName, layerGlyph, drawPointsFunc=drawPointsFunc, validate=False
            )
            if writeGlyphSetContents:
                # FIXME: this is inefficient if we write many glyphs
                self.updateGlyphSetContents(glyphSet)

            modTimes.add(glyphSet.getGLIFModificationTime(glyphName))
        self.savedGlyphModificationTimes[glyphName] = modTimes

    def _packLocalDesignSpace(self, glyph):
        localDS = {}
        axes = [
            dict(
                name=axis.name,
                minimum=axis.minValue,
                default=axis.defaultValue,
                maximum=axis.maxValue,
            )
            for axis in glyph.axes
        ]
        sources = []
        for source in glyph.sources:
            ufoPath, ufoLayerName = self.ufoLayers[source.layerName]
            if asdict(source) in self.globalSources:
                # this source is part of the global sources as defined
                # in the .designspace file, so should not be written
                # to a local designspace
                continue
            sourceDict = {}
            sourceDict["layername"] = ufoLayerName  # could skip if default layer name
            sourceDict["location"] = source.location
            sources.append(sourceDict)
        if axes:
            localDS["axes"] = axes
        if sources:
            localDS["sources"] = sources
        return localDS

    async def getGlobalAxes(self):
        return self.axes

    async def getUnitsPerEm(self):
        return self.defaultFontInfo.unitsPerEm

    async def getFontLib(self):
        return self.dsDoc.lib

    async def watchExternalChanges(self):
        ufoPaths = sorted(self.ufoReaders)
        async for changes in watchfiles.awatch(*ufoPaths):
            glyphNames = set()
            newGlyphNames = set()
            deletedGlyphNames = set()
            rebuildGlyphSetContents = False
            for change, path in changes:
                fileName = os.path.basename(path)
                if not fileName.endswith(".glif"):
                    # TODO: deal with other file types and .designspace
                    continue

                glyphName = self.glifFileNames.get(fileName)

                if change == watchfiles.Change.deleted:
                    # Deleted glyph
                    rebuildGlyphSetContents = True
                    if path.startswith(self.dsDoc.default.path):
                        # The glyph was deleted from the default source,
                        # do a full delete
                        del self.glifFileNames[fileName]
                        deletedGlyphNames.add(glyphName)
                    # else:
                        # The glyph was deleted from a non-default source,
                        # just reload.
                elif change == watchfiles.Change.added:
                    rebuildGlyphSetContents = True
                    if glyphName is None:
                        with open(path, "rb") as f:
                            glyphName, _ = extractGlyphNameAndUnicodes(f.read())
                        self.glifFileNames[fileName] = glyphName
                        newGlyphNames.add(glyphName)
                        continue
                else:
                    assert change == watchfiles.Change.modified

                if glyphName is None:
                    continue

                if os.path.exists(path):
                    mtime = os.stat(path).st_mtime
                    # Round-trip through datetime, as that's effectively what is happening
                    # in getGLIFModificationTime, deep down in the fs package. It makes sure
                    # we're comparing timestamps that are actually comparable, as they're
                    # rounded somewhat, compared to the raw st_mtime timestamp.
                    mtime = datetime.fromtimestamp(mtime).timestamp()
                else:
                    mtime = None
                savedMTimes = self.savedGlyphModificationTimes.get(glyphName, ())
                if mtime not in savedMTimes:
                    logger.info(
                        f"external change '{glyphName}' {mtime} "
                        f"{savedMTimes} {mtime in savedMTimes}"
                    )
                    glyphNames.add(glyphName)

            externalChange = None
            reloadPattern = None

            if rebuildGlyphSetContents:
                for glyphSet in self.ufoGlyphSets.values():
                    glyphSet.rebuildContents()

            glyphMapChanges = []
            for glyphName in newGlyphNames:
                glifData = self.defaultSourceGlyphSet.getGLIF(glyphName)
                gn, unicodes = extractGlyphNameAndUnicodes(glifData)
                glyphMapChanges.append((glyphName, unicodes))

            for glyphName in deletedGlyphNames:
                glyphMapChanges.append((glyphName, None))

            if glyphMapChanges:
                subChanges = [
                    {"f": "=", "a": [glyphName, unicodes]}
                    for glyphName, unicodes in glyphMapChanges
                    if unicodes is not None
                ]
                subChanges += [
                    {"f": "d", "a": [glyphName]}
                    for glyphName, unicodes in glyphMapChanges
                    if unicodes is None
                ]
                externalChange = {"p": ["glyphMap"]}
                if len(subChanges) == 1:
                    externalChange.update(subChanges[0])
                else:
                    externalChange["c"] = subChanges

            if glyphNames:
                reloadPattern = {"glyphs": dict.fromkeys(glyphNames)}

            if externalChange or reloadPattern:
                yield externalChange, reloadPattern


class UFOBackend:
    @classmethod
    def fromPath(cls, path):
        dsDoc = DesignSpaceDocument()
        dsDoc.addSourceDescriptor(path=os.fspath(path))
        return DesignspaceBackend(dsDoc)


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
            staticGlyph, glyph = serializeStaticGlyph(glyphSet, glyphName)
            layers.append(Layer(name=layerName, glyph=staticGlyph))
            if layerName == sourceLayerName:
                sourceLayerGlyph = glyph
    return layers, sourceLayerGlyph


def serializeStaticGlyph(glyphSet, glyphName):
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


def buildUFOLayerGlyph(
    glyphSet: GlyphSet,
    glyphName: str,
    staticGlyph: StaticGlyph,
    unicodes: list[int],
) -> None:
    layerGlyph = UFOGlyph()
    layerGlyph.lib = {}
    if glyphName in glyphSet:
        # We read the existing glyph so we don't lose any data that
        # Fontra doesn't understand
        glyphSet.readGlyph(glyphName, layerGlyph, validate=False)
    layerGlyph.unicodes = unicodes
    pen = RecordingPointPen()
    layerGlyph.width = staticGlyph.xAdvance
    layerGlyph.height = staticGlyph.yAdvance
    staticGlyph.path.drawPoints(pen)
    variableComponents = []
    for component in staticGlyph.components:
        if component.location:
            # It's a variable component
            varCoDict = {"base": component.name, "location": component.location}
            if component.transformation != Transformation():
                varCoDict["transformation"] = asdict(component.transformation)
            variableComponents.append(varCoDict)
        else:
            # It's a regular component
            pen.addComponent(
                component.name,
                cleanAffine(makeAffineTransform(component.transformation)),
            )

    if variableComponents:
        layerGlyph.lib[VARIABLE_COMPONENTS_LIB_KEY] = variableComponents
    else:
        layerGlyph.lib.pop(VARIABLE_COMPONENTS_LIB_KEY, None)

    return layerGlyph, pen.replay


def getGlyphMapFromGlyphSet(glyphSet):
    glyphMap = {}
    for glyphName in glyphSet.keys():
        glifData = glyphSet.getGLIF(glyphName)
        gn, unicodes = extractGlyphNameAndUnicodes(glifData)
        assert gn == glyphName, (gn, glyphName)
        glyphMap[glyphName] = unicodes
    return glyphMap


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
