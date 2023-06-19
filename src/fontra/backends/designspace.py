from __future__ import annotations

import asyncio
import logging
import math
import os
from dataclasses import asdict
from datetime import datetime
from functools import cached_property
from types import SimpleNamespace

import watchfiles
from fontTools.designspaceLib import DesignSpaceDocument
from fontTools.misc.transform import Transform
from fontTools.pens.recordingPen import RecordingPointPen
from fontTools.ufoLib import UFOReaderWriter
from fontTools.ufoLib.glifLib import GlyphSet

from ..core.changes import applyChange
from ..core.classes import (
    Component,
    Layer,
    LocalAxis,
    Source,
    StaticGlyph,
    Transformation,
    VariableGlyph,
)
from ..core.packedpath import PackedPathPointPen
from .ufo_utils import extractGlyphNameAndUnicodes

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
        axisPolePositions = {}
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
            axisPolePositions[axis.name] = (
                axis.map_forward(axis.minimum),
                axis.map_forward(axis.default),
                axis.map_forward(axis.maximum),
            )
        self.axes = axes
        self.axisPolePositions = axisPolePositions
        self.defaultLocation = {
            axisName: polePosition[1]
            for axisName, polePosition in axisPolePositions.items()
        }
        self.loadSources()
        self.buildFileNameMapping()
        self.glyphMap = getGlyphMapFromGlyphSet(self.defaultSourceGlyphSet)
        self.savedGlyphModificationTimes = {}

    def close(self):
        pass

    @property
    def defaultReader(self):
        return self.ufoReaders[self.dsDoc.default.path]

    @cached_property
    def defaultFontInfo(self):
        fontInfo = UFOFontInfo()
        self.defaultReader.readInfo(fontInfo)
        return fontInfo

    def loadSources(self):
        self.ufoReaders = {}  # keyed by path
        self.ufoGlyphSets = {}  # keyed by fontraLayerName
        self.fontraLayerNames = {}  # key: (path, ufoLayerName), value: fontraLayerName
        self.ufoLayers = {}  # key: fontraLayerName, value: (path, ufoLayerName)
        self.globalSources = []
        self.defaultSourceReader = None
        self.defaultSourceGlyphSet = None
        makeUniqueSourceName = uniqueNameMaker()
        for sourceIndex, source in enumerate(self.dsDoc.sources):
            sourceFileName = os.path.splitext(os.path.basename(source.path))[0]
            sourceStyleName = source.styleName or sourceFileName
            sourceName = makeUniqueSourceName(source.layerName or sourceStyleName)
            path = source.path
            reader = self.ufoReaders.get(path)
            if reader is None:
                reader = self.ufoReaders[path] = UFOReaderWriter(path)
            for ufoLayerName in reader.getLayerNames():
                key = (path, ufoLayerName)
                fontraLayerName = self.fontraLayerNames.get(key)
                if fontraLayerName is None:
                    fontraLayerName = f"{sourceFileName}/{ufoLayerName}"
                    self.fontraLayerNames[key] = fontraLayerName
                    self.ufoLayers[fontraLayerName] = key
                    self.ufoGlyphSets[fontraLayerName] = reader.getGlyphSet(
                        ufoLayerName, defaultLayer=False
                    )
            sourceLayerName = (
                source.layerName
                if source.layerName is not None
                else reader.getDefaultLayerName()
            )
            fontraLayerName = self.fontraLayerNames[(path, sourceLayerName)]
            sourceDict = dict(
                location={**self.defaultLocation, **source.location},
                name=sourceName,
                layerName=fontraLayerName,
            )
            if source == self.dsDoc.default:
                self.defaultSourceReader = reader
                self.defaultSourceGlyphSet = self.ufoGlyphSets[fontraLayerName]
            self.globalSources.append(sourceDict)
        self.globalSourcesByLocation = {
            tuplifyLocation(source["location"]): source for source in self.globalSources
        }

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
        return dict(self.glyphMap)

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

        layers = {}
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
            layers[fontraLayerName] = Layer(staticGlyph)
        glyph.layers = layers

        return glyph

    def _unpackLocalDesignSpace(self, dsDict, ufoPath, defaultLayerName):
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
                raise NotImplementedError
                # ufoPath = ...
            ufoLayerName = source.get("layername", defaultLayerName)
            sourceName = source.get(
                "name",
                ufoLayerName if ufoLayerName != defaultLayerName else "<default>",
            )
            fontraLayerName = self.fontraLayerNames[ufoPath, ufoLayerName]
            sources.append(
                Source(
                    name=sourceName,
                    location=source["location"],
                    layerName=fontraLayerName,
                )
            )
        return axes, sources

    async def putGlyph(self, glyphName, glyph, unicodes):
        assert isinstance(unicodes, list)
        assert all(isinstance(cp, int) for cp in unicodes)
        modTimes = set()
        self.glyphMap[glyphName] = unicodes
        layerNameMapping = {}
        localDS = self._packLocalDesignSpace(glyph)
        for source in glyph.sources:
            globalSource = self._getGlobalSource(source, not localDS)
            if globalSource is not None:
                layerNameMapping[source.layerName] = globalSource["layerName"]
            elif not localDS:
                # TODO:
                # Create new source in the DS, and a new layer in
                # the default source UFO *or* create a new UFO.
                raise NotImplementedError(
                    "unknown DS location found: insert source or make local source?"
                )

        usedLayers = set()
        for layerName, layer in glyph.layers.items():
            layerName = layerNameMapping.get(layerName, layerName)
            glyphSet = self.ufoGlyphSets[layerName]
            usedLayers.add(layerName)
            writeGlyphSetContents = glyphName not in glyphSet
            layerGlyph, drawPointsFunc = buildUFOLayerGlyph(
                glyphSet, glyphName, layer.glyph, unicodes
            )
            if glyphSet == self.defaultSourceGlyphSet:
                if localDS:
                    layerGlyph.lib[GLYPH_DESIGNSPACE_LIB_KEY] = localDS
                else:
                    layerGlyph.lib.pop(GLYPH_DESIGNSPACE_LIB_KEY, None)

            glyphSet.writeGlyph(glyphName, layerGlyph, drawPointsFunc=drawPointsFunc)
            if writeGlyphSetContents:
                # FIXME: this is inefficient if we write many glyphs
                self.updateGlyphSetContents(glyphSet)

            modTimes.add(glyphSet.getGLIFModificationTime(glyphName))

        relevantLayerNames = set(
            ln for ln, gs in self.ufoGlyphSets.items() if glyphName in gs
        )
        layersToDelete = relevantLayerNames - usedLayers
        for layerName in layersToDelete:
            glyphSet = self.ufoGlyphSets[layerName]
            glyphSet.deleteGlyph(glyphName)
            # FIXME: this is inefficient if we write many glyphs
            self.updateGlyphSetContents(glyphSet)
            modTimes.add(None)

        self.savedGlyphModificationTimes[glyphName] = modTimes

    def _getGlobalSource(self, source, create=False):
        sourceLocation = {**self.defaultLocation, **source.location}
        sourceLocationTuple = tuplifyLocation(sourceLocation)
        globalSource = self.globalSourcesByLocation.get(sourceLocationTuple)
        if globalSource is None and create:
            if isLocationAtPole(source.location, self.axisPolePositions):
                raise NotImplementedError("create new UFO")
            else:
                makeUniqueName = uniqueNameMaker(
                    self.defaultSourceReader.getLayerNames()
                )
                # TODO: parse source.layerName, in case it's FileName/layerName?
                ufoLayerName = makeUniqueName(source.name)
                glyphSet = self.defaultReader.getGlyphSet(
                    ufoLayerName, defaultLayer=False
                )
                self.defaultReader.writeLayerContents()

                ufoPath = self.dsDoc.default.path
                sourceFileName = os.path.splitext(os.path.basename(ufoPath))[0]
                self.dsDoc.addSourceDescriptor(
                    styleName=source.name,
                    location=sourceLocation,
                    path=ufoPath,
                    layerName=ufoLayerName,
                )
                self.dsDoc.write(self.dsDoc.path)

                fontraLayerName = f"{sourceFileName}/{ufoLayerName}"
                globalSource = dict(
                    location=sourceLocation,
                    name=source.name,
                    layerName=fontraLayerName,
                )
                self.globalSources.append(globalSource)
                self.globalSourcesByLocation[sourceLocationTuple] = globalSource
                self.ufoGlyphSets[fontraLayerName] = glyphSet
                self.fontraLayerNames[ufoPath, ufoLayerName] = fontraLayerName
                self.ufoLayers[fontraLayerName] = (ufoPath, ufoLayerName)

        return globalSource

    def _packLocalDesignSpace(self, glyph):
        if not glyph.axes:
            return None
        defaultUFOLayerName = self.defaultReader.getDefaultLayerName()
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
            globalSource = self._getGlobalSource(source)
            if globalSource is not None:
                # this source is part of the global sources as defined
                # in the .designspace file, so should not be written
                # to a local designspace
                continue
            # FIXME: KeyError -> create new layer
            ufoPath, ufoLayerName = self.ufoLayers[source.layerName]
            assert ufoPath == self.dsDoc.default.path
            sourceDict = {}
            if ufoLayerName != defaultUFOLayerName:
                sourceDict["layername"] = ufoLayerName
            sourceDict["location"] = source.location
            sources.append(sourceDict)
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
            changes = cleanupWatchFilesChanges(changes)
            changedItems = await self._analyzeExternalChanges(changes)

            glyphMapUpdates = {}

            # TODO: update glyphMap for changed non-new glyphs

            for glyphName in changedItems.newGlyphs:
                try:
                    glifData = self.defaultSourceGlyphSet.getGLIF(glyphName)
                except KeyError:
                    logger.info(f"new glyph '{glyphName}' not found in default source")
                    continue
                gn, unicodes = extractGlyphNameAndUnicodes(glifData)
                glyphMapUpdates[glyphName] = unicodes

            for glyphName in changedItems.deletedGlyphs:
                glyphMapUpdates[glyphName] = None

            externalChange = makeGlyphMapChange(glyphMapUpdates)

            reloadPattern = (
                {"glyphs": dict.fromkeys(changedItems.changedGlyphs)}
                if changedItems.changedGlyphs
                else None
            )

            if externalChange:
                rootObject = {"glyphMap": self.glyphMap}
                applyChange(rootObject, externalChange)

            if externalChange or reloadPattern:
                yield externalChange, reloadPattern

    async def _analyzeExternalChanges(self, changes):
        changedItems = SimpleNamespace(
            changedGlyphs=set(),
            newGlyphs=set(),
            deletedGlyphs=set(),
            rebuildGlyphSetContents=False,
        )
        for change, path in changes:
            _, fileSuffix = os.path.splitext(path)

            if fileSuffix == ".glif":
                self._analyzeExternalGlyphChanges(change, path, changedItems)

        if changedItems.rebuildGlyphSetContents:
            #
            # In some cases we're responding to a changed glyph while the
            # contents.plist hasn't finished writing yet. Let's pause a little
            # bit and hope for the best.
            #
            # This is obviously not a solid solution, and I'm not sure there is
            # one, given we don't know whether new .glif files written before or
            # after the corresponding contents.plist file. And even if we do know,
            # the amount of time between the two events can be arbitrarily long,
            # at least in theory, when many new glyphs are written at once.
            #
            # TODO: come up with a better solution.
            #
            await asyncio.sleep(0.15)
            for glyphSet in self.ufoGlyphSets.values():
                glyphSet.rebuildContents()

        return changedItems

    def _analyzeExternalGlyphChanges(self, change, path, changedItems):
        fileName = os.path.basename(path)
        glyphName = self.glifFileNames.get(fileName)

        if change == watchfiles.Change.deleted:
            # Deleted glyph
            changedItems.rebuildGlyphSetContents = True
            if path.startswith(os.path.join(self.dsDoc.default.path, "glyphs/")):
                # The glyph was deleted from the default source,
                # do a full delete
                del self.glifFileNames[fileName]
                changedItems.deletedGlyphs.add(glyphName)
            # else:
            # The glyph was deleted from a non-default source,
            # just reload.
        elif change == watchfiles.Change.added:
            # New glyph
            changedItems.rebuildGlyphSetContents = True
            if glyphName is None:
                with open(path, "rb") as f:
                    glyphName, _ = extractGlyphNameAndUnicodes(f.read())
                self.glifFileNames[fileName] = glyphName
                changedItems.newGlyphs.add(glyphName)
                return
        else:
            # Changed glyph
            assert change == watchfiles.Change.modified

        if glyphName is None:
            return

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
            logger.info(f"external change '{glyphName}'")
            changedItems.changedGlyphs.add(glyphName)


def makeGlyphMapChange(glyphMapUpdates):
    if not glyphMapUpdates:
        return None
    changes = [
        {"f": "=", "a": [glyphName, unicodes]}
        for glyphName, unicodes in glyphMapUpdates.items()
        if unicodes is not None
    ] + [
        {"f": "d", "a": [glyphName]}
        for glyphName, unicodes in glyphMapUpdates.items()
        if unicodes is None
    ]
    glyphMapChange = {"p": ["glyphMap"]}
    if len(changes) == 1:
        glyphMapChange.update(changes[0])
    else:
        glyphMapChange["c"] = changes
    return glyphMapChange


class UFOBackend:
    @classmethod
    def fromPath(cls, path):
        dsDoc = DesignSpaceDocument()
        dsDoc.addSourceDescriptor(path=os.fspath(path), styleName="default")
        return DesignspaceBackend(dsDoc)


class UFOGlyph:
    unicodes = ()
    width = 0


class UFOFontInfo:
    unitsPerEm = 1000


def serializeGlyphLayers(glyphSets, glyphName, sourceLayerName):
    layers = {}
    sourceLayerGlyph = None
    for layerName, glyphSet in glyphSets.items():
        if glyphName in glyphSet:
            staticGlyph, glyph = serializeStaticGlyph(glyphSet, glyphName)
            layers[layerName] = Layer(glyph=staticGlyph)
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


def uniqueNameMaker(existingNames=()):
    usedNames = set(existingNames)

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


def cleanupWatchFilesChanges(changes):
    # If a path is mentioned with more than one event type, we pick the most
    # appropriate one among them:
    # - if there is a delete event and the path does not exist: delete it is
    # - else: keep the lowest sorted event (order: added, modified, deleted)
    perPath = {}
    for change, path in sorted(changes):
        if path in perPath:
            if change == watchfiles.Change.deleted and not os.path.exists(path):
                # File doesn't exist, event to "deleted"
                perPath[path] = watchfiles.Change.deleted
            # else: keep the first event
        else:
            perPath[path] = change
    return [(change, path) for path, change in perPath.items()]


def tuplifyLocation(loc):
    # TODO: find good place to share this (duplicated from opentype.py)
    return tuple(sorted(loc.items()))


def isLocationAtPole(location, poles):
    for name, value in location.items():
        if value not in poles.get(name, ()):
            return False
    return True
