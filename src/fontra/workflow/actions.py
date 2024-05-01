from __future__ import annotations

import itertools
import json
import logging
import os
import pathlib
import tempfile
from contextlib import aclosing, asynccontextmanager
from copy import deepcopy
from dataclasses import dataclass, field, replace
from functools import cached_property, partial
from types import SimpleNamespace
from typing import (
    Any,
    AsyncContextManager,
    AsyncGenerator,
    ClassVar,
    Protocol,
    get_type_hints,
    runtime_checkable,
)

from fontTools.misc.roundTools import otRound
from fontTools.misc.transform import Transform
from fontTools.varLib.models import piecewiseLinearMap

from ..backends import getFileSystemBackend, newFileSystemBackend
from ..backends.copy import copyFont
from ..backends.filenames import stringToFileName
from ..backends.null import NullBackend
from ..core.async_property import async_cached_property
from ..core.classes import (
    Axes,
    Component,
    DiscreteFontAxis,
    FontInfo,
    FontSource,
    GlyphSource,
    Layer,
    OpenTypeFeatures,
    StaticGlyph,
    VariableGlyph,
    structure,
    unstructure,
)
from ..core.instancer import FontInstancer
from ..core.path import PackedPath
from ..core.protocols import ReadableFontBackend
from .features import LayoutHandling, mergeFeatures, subsetFeatures
from .featurewriter import FeatureWriter, VariableScalar
from .merger import cmapFromGlyphMap

logger = logging.getLogger(__name__)


class ActionError(Exception):
    pass


@runtime_checkable
class FilterActionProtocol(Protocol):
    def connect(
        self, input: ReadableFontBackend
    ) -> AsyncContextManager[ReadableFontBackend]:
        pass


@runtime_checkable
class InputActionProtocol(Protocol):
    def prepare(self) -> AsyncContextManager[ReadableFontBackend]:
        pass


@runtime_checkable
class OutputActionProtocol(Protocol):
    def connect(
        self, input: ReadableFontBackend
    ) -> AsyncContextManager[OutputProcessorProtocol]:
        pass


@runtime_checkable
class OutputProcessorProtocol(Protocol):
    async def process(
        self, outputDir: os.PathLike = pathlib.Path(), *, continueOnError=False
    ) -> None:
        pass


_actionRegistry: dict[str, dict[str, type]] = {
    "filter": {},
    "input": {},
    "output": {},
}


def _actionRegistryWrapper(cls, actionName, actionType):
    registry = _actionRegistry[actionType]
    assert actionName not in registry
    cls.actionName = actionName
    registry[actionName] = cls
    return cls


def getActionClass(actionType: str, actionName: str) -> type:
    registry = _actionRegistry[actionType]
    cls = registry.get(actionName)
    if cls is None:
        raise KeyError(f"No action found named '{actionName}'")
    return cls


def registerFilterAction(actionName):
    return partial(_actionRegistryWrapper, actionName=actionName, actionType="filter")


def registerInputAction(actionName):
    return partial(_actionRegistryWrapper, actionName=actionName, actionType="input")


def registerOutputAction(actionName):
    return partial(_actionRegistryWrapper, actionName=actionName, actionType="output")


@dataclass(kw_only=True)
class BaseFilter:
    input: ReadableFontBackend = field(init=False, default=NullBackend())
    actionName: ClassVar[str]

    @cached_property
    def validatedInput(self) -> ReadableFontBackend:
        assert isinstance(self.input, ReadableFontBackend)
        return self.input

    @cached_property
    def fontInstancer(self):
        return FontInstancer(self.validatedInput)

    @async_cached_property
    def inputAxes(self):
        return self.validatedInput.getAxes()

    @async_cached_property
    def inputGlyphMap(self):
        return self.validatedInput.getGlyphMap()

    @asynccontextmanager
    async def connect(
        self, input: ReadableFontBackend
    ) -> AsyncGenerator[ReadableFontBackend, None]:
        self.input = input
        try:
            yield self
        finally:
            self.input = NullBackend()
            await input.aclose()
            try:
                del self.validatedInput
            except AttributeError:
                pass

    async def aclose(self) -> None:
        pass

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        glyph = await self.validatedInput.getGlyph(glyphName)
        if glyph is None:
            return None
        return await self.processGlyph(glyph)

    async def getFontInfo(self) -> FontInfo:
        fontInfo = await self.validatedInput.getFontInfo()
        return await self.processFontInfo(fontInfo)

    async def getAxes(self) -> Axes:
        axes = await self.validatedInput.getAxes()
        return await self.processAxes(axes)

    async def getSources(self) -> dict[str, FontSource]:
        sources = await self.validatedInput.getSources()
        return await self.processSources(sources)

    async def getGlyphMap(self) -> dict[str, list[int]]:
        return await self.processGlyphMap(await self.inputGlyphMap)

    async def getFeatures(self) -> OpenTypeFeatures:
        features = await self.validatedInput.getFeatures()
        return await self.processFeatures(features)

    async def getCustomData(self) -> dict[str, Any]:
        customData = await self.validatedInput.getCustomData()
        return await self.processCustomData(customData)

    async def getUnitsPerEm(self) -> int:
        unitsPerEm = await self.validatedInput.getUnitsPerEm()
        return await self.processUnitsPerEm(unitsPerEm)

    # Default no-op process methods, to be overridden.

    # These methods should *not* modify the objects, but return modified *copies*

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        return glyph

    async def processFontInfo(self, fontInfo: FontInfo) -> FontInfo:
        return fontInfo

    async def processAxes(self, axes: Axes) -> Axes:
        return axes

    async def processSources(
        self, sources: dict[str, FontSource]
    ) -> dict[str, FontSource]:
        return sources

    async def processGlyphMap(
        self, glyphMap: dict[str, list[int]]
    ) -> dict[str, list[int]]:
        return glyphMap

    async def processFeatures(self, features: OpenTypeFeatures) -> OpenTypeFeatures:
        return features

    async def processCustomData(self, customData):
        return customData

    async def processUnitsPerEm(self, unitsPerEm: int) -> int:
        return unitsPerEm


@registerFilterAction("scale")
@dataclass(kw_only=True)
class Scale(BaseFilter):
    scaleFactor: float
    scaleUnitsPerEm: bool = True

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        transformation = Transform().scale(self.scaleFactor)
        return replace(
            glyph,
            layers={
                layerName: replace(
                    layer, glyph=self._scaleStaticGlyph(layer.glyph, transformation)
                )
                for layerName, layer in glyph.layers.items()
            },
        )

    def _scaleStaticGlyph(
        self, glyph: StaticGlyph, transformation: Transform
    ) -> StaticGlyph:
        xAdvance = (
            glyph.xAdvance * self.scaleFactor if glyph.xAdvance else glyph.xAdvance
        )
        yAdvance = (
            glyph.yAdvance * self.scaleFactor if glyph.yAdvance else glyph.yAdvance
        )
        verticalOrigin = (
            glyph.verticalOrigin * self.scaleFactor
            if glyph.verticalOrigin
            else glyph.verticalOrigin
        )
        anchors = [
            replace(a, x=a.x * self.scaleFactor, y=a.y * self.scaleFactor)
            for a in glyph.anchors
        ]
        # TODO: guidelines
        return replace(
            glyph,
            xAdvance=xAdvance,
            yAdvance=yAdvance,
            verticalOrigin=verticalOrigin,
            path=glyph.path.transformed(transformation),
            components=[
                self._scaleComponentOrigin(component) for component in glyph.components
            ],
            anchors=anchors,
        )

    def _scaleComponentOrigin(self, component: Component) -> Component:
        scaleFactor = self.scaleFactor
        x = component.transformation.translateX * scaleFactor
        y = component.transformation.translateY * scaleFactor
        return replace(
            component,
            transformation=replace(
                component.transformation, translateX=x, translateY=y
            ),
        )

    async def processUnitsPerEm(self, unitsPerEm: int) -> int:
        if self.scaleUnitsPerEm:
            return otRound(unitsPerEm * self.scaleFactor)
        else:
            return unitsPerEm


@dataclass(kw_only=True)
class BaseGlyphSubsetter(BaseFilter):
    _glyphMap: dict[str, list[int]] | None = field(init=False, repr=False, default=None)
    layoutHandling: str = LayoutHandling.SUBSET

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        glyphMap, _ = await self._subsettedGlyphMapAndFeatures
        if glyphName not in glyphMap:
            return None
        return await self.validatedInput.getGlyph(glyphName)

    async def getFeatures(self) -> OpenTypeFeatures:
        _, features = await self._subsettedGlyphMapAndFeatures
        return features

    async def getGlyphMap(self) -> dict[str, list[int]]:
        glyphMap, _ = await self._subsettedGlyphMapAndFeatures
        return glyphMap

    @async_cached_property
    async def _subsettedGlyphMapAndFeatures(
        self,
    ) -> tuple[dict[str, list[int]], OpenTypeFeatures]:
        inputGlyphMap = await self.inputGlyphMap
        selectedGlyphs = await self._buildSubsettedGlyphSet(inputGlyphMap)

        selectedGlyphs, features = await self._featuresClosure(selectedGlyphs)
        selectedGlyphs = await self._componentsClosure(selectedGlyphs)
        glyphMap = filterGlyphMap(inputGlyphMap, selectedGlyphs)
        return glyphMap, features

    async def _buildSubsettedGlyphSet(
        self, originalGlyphMap: dict[str, list[int]]
    ) -> set[str]:
        # Override
        raise NotImplementedError

    async def _featuresClosure(
        self, selectedGlyphs
    ) -> tuple[set[str], OpenTypeFeatures]:
        features = await self.validatedInput.getFeatures()

        if features.language != "fea" and features.text:
            logger.warning(
                f"{self.actionName}: can't subset features in language={features.language}"
            )
        elif features.text:
            subsettedFeatureText, subsettedGlyphMap = subsetFeatures(
                features.text,
                await self.inputGlyphMap,
                keepGlyphNames=selectedGlyphs,
                layoutHandling=LayoutHandling(self.layoutHandling),
            )
            selectedGlyphs = set(subsettedGlyphMap)
            features = OpenTypeFeatures(text=subsettedFeatureText)

        return selectedGlyphs, features

    async def _componentsClosure(self, glyphNames) -> set[str]:
        glyphsToCheck = set(glyphNames)  # this set will shrink
        glyphNamesExpanded = set(glyphNames)  # this set may grow

        while glyphsToCheck:
            glyphName = glyphsToCheck.pop()

            try:
                glyph = await self.validatedInput.getGlyph(glyphName)
                assert glyph is not None, f"Unexpected missing glyph {glyphName}"
            except Exception as e:
                if glyphName != ".notdef":
                    logger.error(
                        f"{self.actionName}: glyph {glyphName} caused an error: {e!r}"
                    )
                continue

            componentNames = getComponentNames(glyph)
            uncheckedGlyphs = componentNames - glyphNamesExpanded
            glyphNamesExpanded.update(uncheckedGlyphs)
            glyphsToCheck.update(uncheckedGlyphs)

        return glyphNamesExpanded


def getComponentNames(glyph):
    return {
        compo.name
        for layer in glyph.layers.values()
        for compo in layer.glyph.components
    }


def filterGlyphMap(glyphMap, glyphNames):
    return {
        glyphName: codePoints
        for glyphName, codePoints in glyphMap.items()
        if glyphName in glyphNames
    }


@registerFilterAction("drop-unreachable-glyphs")
@dataclass(kw_only=True)
class DropUnreachableGlyphs(BaseGlyphSubsetter):
    keepNotdef: bool = True

    async def _buildSubsettedGlyphSet(
        self, originalGlyphMap: dict[str, list[int]]
    ) -> set[str]:
        reachableGlyphs = {
            glyphName
            for glyphName, codePoints in originalGlyphMap.items()
            if codePoints
        }

        if self.keepNotdef:
            reachableGlyphs.add(".notdef")

        return reachableGlyphs


@registerFilterAction("subset-glyphs")
@dataclass(kw_only=True)
class SubsetGlyphs(BaseGlyphSubsetter):
    glyphNames: set[str] = field(default_factory=set)
    glyphNamesFile: str | None = None
    dropGlyphNames: set[str] = field(default_factory=set)
    dropGlyphNamesFile: str | None = None

    def __post_init__(self):
        if self.glyphNamesFile:
            path = pathlib.Path(self.glyphNamesFile)
            assert path.is_file()
            glyphNames = set(path.read_text().split())
            self.glyphNames = set(self.glyphNames) | glyphNames
        if self.dropGlyphNamesFile:
            path = pathlib.Path(self.dropGlyphNamesFile)
            assert path.is_file()
            dropGlyphNames = set(path.read_text().split())
            self.dropGlyphNames = set(self.dropGlyphNames) | dropGlyphNames

    async def _buildSubsettedGlyphSet(
        self, originalGlyphMap: dict[str, list[int]]
    ) -> set[str]:
        glyphNames = set(self.glyphNames)
        if not glyphNames and self.dropGlyphNames:
            glyphNames = set(originalGlyphMap)
        if self.dropGlyphNames:
            glyphNames = glyphNames - set(self.dropGlyphNames)

        return glyphNames


@registerInputAction("fontra-read")
@dataclass(kw_only=True)
class FontraRead:
    source: str

    @asynccontextmanager
    async def prepare(self) -> AsyncGenerator[ReadableFontBackend, None]:
        backend = getFileSystemBackend(pathlib.Path(self.source).resolve())
        try:
            yield backend
        finally:
            await backend.aclose()


@registerOutputAction("fontra-write")
@dataclass(kw_only=True)
class FontraWrite:
    destination: str
    input: ReadableFontBackend | None = field(init=False, default=None)

    @cached_property
    def validatedInput(self) -> ReadableFontBackend:
        assert isinstance(self.input, ReadableFontBackend)
        return self.input

    @asynccontextmanager
    async def connect(
        self, input: ReadableFontBackend
    ) -> AsyncGenerator[OutputActionProtocol, None]:
        self.input = input
        try:
            yield self
        finally:
            self.input = None
            await input.aclose()
            try:
                del self.validatedInput
            except AttributeError:
                pass

    async def process(
        self, outputDir: os.PathLike = pathlib.Path(), *, continueOnError=False
    ) -> None:
        outputDir = pathlib.Path(outputDir)
        output = newFileSystemBackend((outputDir / self.destination).resolve())

        async with aclosing(output):
            await copyFont(self.validatedInput, output, continueOnError=continueOnError)


@registerFilterAction("rename-axes")
@dataclass(kw_only=True)
class RenameAxes(BaseFilter):
    axes: dict[str, dict]  # value dict keys: name, tag, label
    axisRenameMap: dict[str, str] = field(init=False, default_factory=dict)

    def __post_init__(self):
        self.axisRenameMap = {
            axisName: renameInfo["name"]
            for axisName, renameInfo in self.axes.items()
            if "name" in renameInfo
        }

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        return replace(
            glyph,
            sources=[
                replace(
                    source,
                    location=_renameLocationAxes(source.location, self.axisRenameMap),
                )
                for source in glyph.sources
            ],
        )

    async def processAxes(self, axes: Axes) -> Axes:
        return replace(axes, axes=[_renameAxis(axis, self.axes) for axis in axes.axes])


def _renameLocationAxes(location, axisRenameMap):
    return {
        axisRenameMap.get(axisName, axisName): axisValue
        for axisName, axisValue in location.items()
    }


def _renameAxis(axis, axes):
    renameInfo = axes.get(axis.name)
    if renameInfo is not None:
        newAttrs = {
            attrName: renameInfo[attrName]
            for attrName in ["name", "tag", "label"]
            if attrName in renameInfo
        }
        if newAttrs:
            axis = replace(axis, **newAttrs)
    return axis


@registerFilterAction("drop-unused-sources-and-layers")
@dataclass(kw_only=True)
class DropInactiveSources(BaseFilter):
    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        return dropUnusedSourcesAndLayers(glyph)


def dropUnusedSourcesAndLayers(glyph):
    usedSources = getActiveSources(glyph.sources)
    usedLayerNames = {source.layerName for source in usedSources}
    usedLayers = {
        layerName: layer
        for layerName, layer in glyph.layers.items()
        if layerName in usedLayerNames
    }
    if usedSources != glyph.sources or usedLayers != glyph.layers:
        glyph = replace(glyph, sources=usedSources, layers=usedLayers)
    return glyph


@registerFilterAction("drop-axis-mappings")
@dataclass(kw_only=True)
class DropAxisMappings(BaseFilter):
    axes: list[str] | None = None

    @async_cached_property
    async def axisValueMapFunctions(self) -> dict:
        axes = await self.validatedInput.getAxes()
        relevantAxes = (
            [axis for axis in axes.axes if axis.name in self.axes]
            if self.axes
            else axes.axes
        )

        mapFuncs = {}
        for axis in relevantAxes:
            if axis.mapping:
                mapFuncs[axis.name] = partial(
                    piecewiseLinearMap,
                    mapping=dict([(b, a) for a, b in axis.mapping]),
                )

        return mapFuncs

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        mapFuncs = await self.axisValueMapFunctions
        return _remapSourceLocations(glyph, mapFuncs)

    async def getAxes(self) -> Axes:
        axes = await self.inputAxes
        mapFuncs = await self.axisValueMapFunctions
        return replace(
            axes, axes=[_dropAxisMapping(axis, mapFuncs) for axis in axes.axes]
        )


def _remapSourceLocations(glyph, mapFuncs):
    if mapFuncs:
        glyph = replace(
            glyph,
            sources=[
                replace(source, location=_remapLocation(source.location, mapFuncs))
                for source in glyph.sources
            ],
        )
    return glyph


def _remapLocation(location, mapFuncs):
    return {
        axisName: mapFuncs.get(axisName, lambda x: x)(axisValue)
        for axisName, axisValue in location.items()
    }


def _dropAxisMapping(axis, mapFuncs):
    if axis.name in mapFuncs and axis.mapping:
        axis = replace(axis, mapping=[])
    return axis


@registerFilterAction("adjust-axes")
@dataclass(kw_only=True)
class AdjustAxes(BaseFilter):
    axes: dict[str, dict[str, Any]]
    remapSources: bool = True

    @async_cached_property
    async def adjustedAxes(self) -> Axes:
        adjustedAxes, _ = await self._adjustedAxesAndMapFunctions
        return adjustedAxes

    @async_cached_property
    async def axisValueMapFunctions(self) -> dict:
        _, mapFuncs = await self._adjustedAxesAndMapFunctions
        return mapFuncs

    @async_cached_property
    async def _adjustedAxesAndMapFunctions(self) -> tuple:
        mapFuncs: dict = {}
        axes = await self.validatedInput.getAxes()
        adjustedAxes = []
        for axis in axes.axes:
            newValues = self.axes.get(axis.name)
            if newValues is not None:
                newAxis = structure(unstructure(axis) | newValues, type(axis))

                if self.remapSources:
                    if isinstance(axis, DiscreteFontAxis):
                        raise ActionError(
                            f"{self.actionName}: discrete axes are not supported "
                            "with remapSources=true"
                        )
                    mapping = [
                        (axis.minValue, newAxis.minValue),
                        (axis.defaultValue, newAxis.defaultValue),
                        (axis.maxValue, newAxis.maxValue),
                    ]
                    mapFunc = partial(
                        piecewiseLinearMap,
                        mapping=dict(mapping),
                    )
                    if newAxis.mapping:
                        newAxis.mapping = [
                            [mapFunc(user), source] for user, source in newAxis.mapping
                        ]
                    else:
                        mapFuncs[axis.name] = mapFunc

                axis = newAxis
            adjustedAxes.append(axis)
        return replace(axes, axes=adjustedAxes), mapFuncs

    async def getAxes(self) -> Axes:
        return await self.adjustedAxes

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        return _remapSourceLocations(glyph, await self.axisValueMapFunctions)


@registerFilterAction("decompose-composites")
@dataclass(kw_only=True)
class DecomposeComposites(BaseFilter):
    onlyVariableComposites: bool = False

    async def getGlyph(self, glyphName: str) -> VariableGlyph:
        instancer = await self.fontInstancer.getGlyphInstancer(glyphName)
        glyph = instancer.glyph
        defaultFontSourceLocation = instancer.defaultFontSourceLocation

        if not instancer.componentTypes or (
            self.onlyVariableComposites and not any(instancer.componentTypes)
        ):
            return glyph

        haveLocations = getFontSourceLocationsFromSources(
            instancer.activeSources, defaultFontSourceLocation
        )

        needLocations = await getFontSourceLocationsFromBaseGlyphs(
            glyph, self.fontInstancer.backend, defaultFontSourceLocation
        )

        needLocations = multiplyLocations(
            haveLocations, needLocations, defaultFontSourceLocation
        )

        locationsToAdd = [
            dict(location) for location in sorted(needLocations - haveLocations)
        ]
        layerNames = [locationToString(location) for location in locationsToAdd]

        newSources = instancer.activeSources + [
            GlyphSource(name=name, location=location, layerName=name)
            for location, name in zip(locationsToAdd, layerNames, strict=True)
        ]
        newLayers = {}

        for source in newSources:
            instance = instancer.instantiate(source.location)

            newLayers[source.layerName] = Layer(
                glyph=replace(
                    instance.glyph,
                    path=await instance.getDecomposedPath(),
                    components=[],
                ),
            )

        return replace(glyph, sources=newSources, layers=newLayers)


async def getFontSourceLocationsFromBaseGlyphs(
    glyph, backend, defaultFontSourceLocation, seenGlyphNames=None
) -> set[tuple]:
    if seenGlyphNames is None:
        seenGlyphNames = set()

    baseGlyphNames = set()
    for source in getActiveSources(glyph.sources):
        for compo in glyph.layers[source.layerName].glyph.components:
            baseGlyphNames.add(compo.name)

    baseGlyphNames -= seenGlyphNames

    baseGlyphs = [await backend.getGlyph(name) for name in baseGlyphNames]

    locations = set()
    for baseGlyph in baseGlyphs:
        locations.update(
            getFontSourceLocationsFromSources(
                getActiveSources(baseGlyph.sources), defaultFontSourceLocation
            )
        )

    seenGlyphNames |= baseGlyphNames

    for baseGlyph in baseGlyphs:
        locations.update(
            await getFontSourceLocationsFromBaseGlyphs(
                baseGlyph, backend, defaultFontSourceLocation, seenGlyphNames
            )
        )

    return locations


def getFontSourceLocationsFromSources(sources, defaultFontSourceLocation) -> set[tuple]:
    return {
        tuplifyLocation(
            defaultFontSourceLocation
            | {
                k: v
                for k, v in source.location.items()
                if k in defaultFontSourceLocation
            }
        )
        for source in sources
    }


def multiplyLocations(
    haveLocationsTuples, needLocationsTuples, defaultFontSourceLocation
) -> set[tuple]:
    haveLocations = [dict(loc) for loc in haveLocationsTuples]
    needLocations = [
        sparseLocation(dict(loc), defaultFontSourceLocation)
        for loc in needLocationsTuples
    ]
    needLocations = [
        haveLoc | needLoc
        for haveLoc, needLoc in itertools.product(haveLocations, needLocations)
    ]
    return {tuplifyLocation(loc) for loc in needLocations}


def sparseLocation(location, defaultFontSourceLocation):
    return {k: v for k, v in location.items() if v != defaultFontSourceLocation[k]}


def locationToString(loc):
    # TODO: create module for helpers like this, duplicated from opentype.py
    parts = []
    for k, v in sorted(loc.items()):
        v = round(v, 5)  # enough to differentiate all 2.14 fixed values
        iv = int(v)
        if iv == v:
            v = iv
        parts.append(f"{k}={v}")
    return ",".join(parts)


def tuplifyLocation(loc: dict[str, float]) -> tuple:
    return tuple(sorted(loc.items()))


def filterLocation(loc: dict[str, float], axisNames: set[str]) -> dict[str, float]:
    return {name: value for name, value in loc.items() if name in axisNames}


def getActiveSources(sources):
    return [source for source in sources if not source.inactive]


fontInfoNames = set(get_type_hints(FontInfo))


@registerFilterAction("set-font-info")
@dataclass(kw_only=True)
class SetFontInfo(BaseFilter):
    fontInfo: dict[str, str]

    async def processFontInfo(self, fontInfo):
        extraNames = set(self.fontInfo) - fontInfoNames
        if extraNames:
            extraNamesString = ", ".join(repr(n) for n in sorted(extraNames))
            logger.error(f"set-font-info: unknown name(s): {extraNamesString}")
        return structure(unstructure(fontInfo) | self.fontInfo, FontInfo)


@registerFilterAction("subset-axes")
@dataclass(kw_only=True)
class SubsetAxes(BaseFilter):
    axisNames: set[str] = field(default_factory=set)
    dropAxisNames: set[str] = field(default_factory=set)

    def __post_init__(self):
        self.axisNames = set(self.axisNames)
        self.dropAxisNames = set(self.dropAxisNames)

    def getAxisNamesToKeep(self, axes):
        axisNames = (
            set(axis.name for axis in axes)
            if not self.axisNames and self.dropAxisNames
            else self.axisNames
        )
        return axisNames - self.dropAxisNames

    @async_cached_property
    async def locationToKeep(self):
        axes = await self.inputAxes
        keepAxisNames = self.getAxisNamesToKeep(axes.axes)
        location = getDefaultSourceLocation(axes.axes)

        return {n: v for n, v in location.items() if n not in keepAxisNames}

    async def getAxes(self) -> Axes:
        axes = await self.inputAxes
        keepAxisNames = self.getAxisNamesToKeep(axes.axes)

        return replace(
            axes, axes=[axis for axis in axes.axes if axis.name in keepAxisNames]
        )

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        # locationToKeep contains axis *values* for sources we want to keep,
        # but those axes are to be dropped, so it *also* says "axes to drop"
        locationToKeep = await self.locationToKeep

        sources = [
            replace(
                source, location=subsetLocationDrop(source.location, locationToKeep)
            )
            for source in glyph.sources
            if subsetLocationKeep(locationToKeep | source.location, locationToKeep)
            == locationToKeep
        ]

        glyph = replace(glyph, sources=sources)
        return dropUnusedSourcesAndLayers(glyph)


def subsetLocationKeep(location, axisNames):
    return {n: v for n, v in location.items() if n in axisNames}


def subsetLocationDrop(location, axisNames):
    return {n: v for n, v in location.items() if n not in axisNames}


def getDefaultSourceLocation(axes):
    return {
        axis.name: (
            piecewiseLinearMap(axis.defaultValue, dict(axis.mapping))
            if axis.mapping
            else axis.defaultValue
        )
        for axis in axes
    }


@registerFilterAction("move-default-location")
@dataclass(kw_only=True)
class MoveDefaultLocation(BaseFilter):
    newDefaultUserLocation: dict[str, float]

    @async_cached_property
    async def newDefaultSourceLocation(self):
        newDefaultUserLocation = self.newDefaultUserLocation
        axes = await self.inputAxes

        relevantAxes = [
            axis for axis in axes.axes if axis.name in newDefaultUserLocation
        ]

        return {
            axis.name: (
                piecewiseLinearMap(
                    newDefaultUserLocation[axis.name], dict(axis.mapping)
                )
                if axis.mapping
                else newDefaultUserLocation[axis.name]
            )
            for axis in relevantAxes
        }

    async def getAxes(self) -> Axes:
        axes = await self.inputAxes
        newDefaultUserLocation = self.newDefaultUserLocation
        return replace(
            axes,
            axes=[
                replace(
                    axis,
                    defaultValue=newDefaultUserLocation.get(
                        axis.name, axis.defaultValue
                    ),
                )
                for axis in axes.axes
            ],
        )

    async def getGlyph(self, glyphName: str) -> VariableGlyph:
        instancer = await self.fontInstancer.getGlyphInstancer(glyphName)

        defaultLocation = instancer.defaultSourceLocation

        locations = [
            defaultLocation | source.location for source in instancer.activeSources
        ]

        axisNames = {axis.name for axis in instancer.combinedAxes}
        movingAxisNames = set(self.newDefaultUserLocation)
        interactingAxes = set()

        for location in locations:
            contributingAxes = set()
            for axisName, value in location.items():
                if value != defaultLocation[axisName]:
                    contributingAxes.add(axisName)
            if len(contributingAxes) > 1 and not contributingAxes.isdisjoint(
                movingAxisNames
            ):
                interactingAxes.update(contributingAxes)

        standaloneAxes = axisNames - interactingAxes

        newLocations = deepcopy(locations)

        newDefaultSourceLocation = await self.newDefaultSourceLocation
        currentDefaultLocation = dict(defaultLocation)

        for movingAxisName, movingAxisValue in newDefaultSourceLocation.items():
            newDefaultAxisLoc = {movingAxisName: movingAxisValue}

            locationsToAdd = [
                loc | newDefaultAxisLoc
                for loc in newLocations
                if any(
                    loc[axisName] != currentDefaultLocation[axisName]
                    for axisName in interactingAxes
                )
            ]

            for axisName in standaloneAxes:
                if axisName == movingAxisName:
                    continue

                for loc in newLocations:
                    if (
                        loc[axisName] != currentDefaultLocation[axisName]
                        and loc[movingAxisName]
                        == currentDefaultLocation[movingAxisName]
                    ):
                        loc[movingAxisName] = movingAxisValue

            currentDefaultLocation = currentDefaultLocation | newDefaultAxisLoc

            locationsToAdd.append(dict(currentDefaultLocation))
            for loc in locationsToAdd:
                if loc not in newLocations:
                    newLocations.append(loc)

        return updateSourcesAndLayers(instancer, newLocations)


@registerFilterAction("trim-axes")
@dataclass(kw_only=True)
class TrimAxes(BaseFilter):
    axes: dict[str, dict[str, Any]]

    @async_cached_property
    async def _trimmedAxesAndSourceRanges(self):
        axes = await self.validatedInput.getAxes()
        trimmedAxes = []
        sourceRanges = {}

        for axis in axes.axes:
            trimmedAxis = deepcopy(axis)
            trimmedAxes.append(trimmedAxis)

            rangeDict = {
                k: v
                for k, v in self.axes.get(axis.name, {}).items()
                if k in {"minValue", "maxValue"}
            }

            if not rangeDict:
                sourceRanges[axis.name] = (axis.minValue, axis.maxValue)
                continue

            trimmedAxis.minValue = max(
                trimmedAxis.minValue, rangeDict.get("minValue", trimmedAxis.minValue)
            )
            trimmedAxis.maxValue = min(
                trimmedAxis.maxValue, rangeDict.get("maxValue", trimmedAxis.maxValue)
            )

            if trimmedAxis.minValue > trimmedAxis.defaultValue:
                raise ActionError(
                    f"trim-axes: trimmed minValue for {axis.name} should be <= "
                    f"{trimmedAxis.defaultValue}"
                )

            if trimmedAxis.maxValue < trimmedAxis.defaultValue:
                raise ActionError(
                    f"trim-axes: trimmed maxValue for {axis.name} should be >= "
                    f"{trimmedAxis.defaultValue}"
                )

            if trimmedAxis.mapping:
                mapping = dict(trimmedAxis.mapping)
                rangeValues = []
                for userValue in [trimmedAxis.minValue, trimmedAxis.maxValue]:
                    sourceValue = piecewiseLinearMap(userValue, mapping)
                    rangeValues.append(sourceValue)
                    if [userValue, sourceValue] not in trimmedAxis.mapping:
                        trimmedAxis.mapping.append([userValue, sourceValue])

                trimmedAxis.mapping = sorted(
                    [
                        [u, s]
                        for u, s in trimmedAxis.mapping
                        if trimmedAxis.minValue <= u <= trimmedAxis.maxValue
                    ]
                )
                sourceRanges[axis.name] = tuple(rangeValues)
            else:
                sourceRanges[axis.name] = (
                    trimmedAxis.minValue,
                    trimmedAxis.maxValue,
                )

            trimmedAxis.valueLabels = [
                label
                for label in trimmedAxis.valueLabels
                if trimmedAxis.minValue <= label.value <= trimmedAxis.maxValue
            ]

        return replace(axes, axes=trimmedAxes), sourceRanges

    async def getAxes(self) -> Axes:
        trimmedAxes, _ = await self._trimmedAxesAndSourceRanges
        return trimmedAxes

    async def getGlyph(self, glyphName: str) -> VariableGlyph:
        instancer = await self.fontInstancer.getGlyphInstancer(glyphName)

        defaultLocation = instancer.defaultSourceLocation

        newLocations = [
            defaultLocation | source.location for source in instancer.activeSources
        ]

        _, trimmedRanges = await self._trimmedAxesAndSourceRanges

        # Existing source locations can be out of range and cause trouble,
        # so we ensure all source location values are within range.
        # The trouble being that we otherwise may have locations that
        # are unique until they are normalized, and then VariationModel
        # complains.
        localRanges = {
            axis.name: (axis.minValue, axis.maxValue) for axis in instancer.glyph.axes
        }
        ranges = localRanges | trimmedRanges

        for loc in newLocations:
            for axisName, value in loc.items():
                if axisName not in ranges:
                    continue
                minValue, maxValue = ranges[axisName]
                trimmedValue = max(min(value, maxValue), minValue)
                loc[axisName] = trimmedValue

        return updateSourcesAndLayers(instancer, newLocations)


def updateSourcesAndLayers(instancer, newLocations) -> VariableGlyph:
    axisNames = instancer.combinedAxisNames
    glyph = instancer.glyph

    sourcesByLocation = {
        tuplifyLocation(filterLocation(source.location, axisNames)): source
        for source in instancer.activeSources
    }
    locationTuples = sorted(
        {tuplifyLocation(filterLocation(loc, axisNames)) for loc in newLocations}
    )

    newSources = []
    newLayers = {}

    for locationTuple in locationTuples:
        source = sourcesByLocation.get(locationTuple)
        if source is not None:
            newLayers[source.layerName] = glyph.layers[source.layerName]
        else:
            location = dict(locationTuple)
            name = locationToString(location)
            source = GlyphSource(name=name, location=location, layerName=name)
            instance = instancer.instantiate(location)
            newLayers[source.layerName] = Layer(glyph=instance.glyph)

        newSources.append(source)

    return dropUnusedSourcesAndLayers(
        replace(glyph, sources=newSources, layers=newLayers)
    )


@registerFilterAction("check-interpolation")
@dataclass(kw_only=True)
class CheckInterpolation(BaseFilter):

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        # Each of the next two lines may raise an error if the glyph
        # doesn't interpolate
        instancer = await self.fontInstancer.getGlyphInstancer(glyphName)
        _ = instancer.deltas
        return instancer.glyph


@registerFilterAction("memory-cache")
@dataclass(kw_only=True)
class MemoryCache(BaseFilter):
    def __post_init__(self):
        self._glyphCache = {}

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        if glyphName not in self._glyphCache:
            self._glyphCache[glyphName] = await self.validatedInput.getGlyph(glyphName)
        return self._glyphCache[glyphName]


@registerFilterAction("disk-cache")
@dataclass(kw_only=True)
class DiskCache(BaseFilter):
    def __post_init__(self):
        self._tempDir = tempfile.TemporaryDirectory(
            prefix="fontra-workflow-disk-cache-"
        )
        self._tempDirPath = pathlib.Path(self._tempDir.name)
        logger.info(f"disk-cache: created temp dir: {self._tempDir.name}")
        self._glyphFilePaths = {}

    async def aclose(self):
        await super().aclose()
        logger.info(f"disk-cache: cleaning up temp dir: {self._tempDir.name}")
        self._tempDir.cleanup()

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        path = self._glyphFilePaths.get(glyphName)
        if path is None:
            glyph = await self.validatedInput.getGlyph(glyphName)
            obj = unstructure(glyph)
            text = json.dumps(obj, separators=(",", ":"), ensure_ascii=False)
            path = self._tempDirPath / (stringToFileName(glyphName) + ".json")
            self._glyphFilePaths[glyphName] = path
            path.write_text(text, encoding="utf-8")
        else:
            text = path.read_text(encoding="utf-8")
            obj = json.loads(text)
            glyph = structure(obj, VariableGlyph)

        return glyph


@registerFilterAction("subset-by-development-status")
@dataclass(kw_only=True)
class SubsetByDevelopmentStatus(BaseGlyphSubsetter):
    statuses: list[int]
    sourceSelectBehavior: str = (
        "default"  # "any", "all" or "default" (the default source)
    )

    async def _buildSubsettedGlyphSet(
        self, originalGlyphMap: dict[str, list[int]]
    ) -> set[str]:
        statuses = set(self.statuses)
        selectedGlyphs = set()

        for glyphName in originalGlyphMap:
            if self.sourceSelectBehavior == "default":
                try:
                    instancer = await self.fontInstancer.getGlyphInstancer(
                        glyphName, fixComponentLocationCompatibility=False
                    )
                except Exception as e:
                    logger.error(
                        f"{self.actionName}: glyph {glyphName} caused an error: {e!r}"
                    )
                    continue
                sources = [instancer.defaultSource]
                selectFunc = any
            else:
                selectFunc = any if self.sourceSelectBehavior == "any" else all
                glyph = await self.validatedInput.getGlyph(glyphName)
                if glyph is None:
                    continue
                sources = getActiveSources(glyph.sources)

            if selectFunc(
                source.customData.get("fontra.development.status") in statuses
                for source in sources
            ):
                selectedGlyphs.add(glyphName)

        return selectedGlyphs


@registerFilterAction("drop-shapes")
@dataclass(kw_only=True)
class DropShapes(BaseFilter):
    dropPath: bool = True
    dropComponents: bool = True
    dropAnchors: bool = True

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        clearedItems: dict[str, Any] = {}
        if self.dropPath:
            clearedItems["path"] = PackedPath()
        if self.dropComponents:
            clearedItems["components"] = []
        if self.dropAnchors:
            clearedItems["anchors"] = []

        return replace(
            glyph,
            layers={
                layerName: replace(layer, glyph=replace(layer.glyph, **clearedItems))
                for layerName, layer in glyph.layers.items()
            },
        )


@registerFilterAction("amend-cmap")
@dataclass(kw_only=True)
class AmendCmap(BaseFilter):
    cmap: dict[int | str, str | None] = field(default_factory=dict)
    cmapFile: str | None = None

    def __post_init__(self) -> None:
        self.cmap = {
            (
                codePoint
                if isinstance(codePoint, int)
                else parseCodePointString(codePoint, self.actionName)
            ): glyphName
            for codePoint, glyphName in self.cmap.items()
        }

        if not self.cmapFile:
            return
        path = pathlib.Path(self.cmapFile)
        assert path.is_file()

        cmap = {}
        for line in path.read_text().splitlines():
            parts = line.split()
            if len(parts) == 1:
                codePointString = parts[0]
                glyphName = None
            else:
                codePointString, glyphName = parts

            codePoint = parseCodePointString(codePointString, self.actionName)
            cmap[codePoint] = glyphName

        self.cmap = cmap | self.cmap

    async def processGlyphMap(
        self, glyphMap: dict[str, list[int]]
    ) -> dict[str, list[int]]:
        newGlyphMap: dict[str, list[int]] = {glyphName: [] for glyphName in glyphMap}
        cmap = cmapFromGlyphMap(glyphMap) | self.cmap
        for codePoint, glyphName in sorted(cmap.items()):
            if glyphName:
                if glyphName not in newGlyphMap:
                    logger.warning(
                        f"{self.actionName}: glyph {glyphName} does not exist"
                    )
                else:
                    newGlyphMap[glyphName].append(codePoint)
        return newGlyphMap


def parseCodePointString(codePointString, actionName):
    if not codePointString[:2] == "U+":
        raise ActionError(
            f"{actionName} codePoint must start with U+, found {codePointString}"
        )

    return int(codePointString[2:], 16)


@registerFilterAction("round-coordinates")
@dataclass(kw_only=True)
class RoundCoordinates(BaseFilter):
    roundPathCoordinates: bool = True
    roundComponentOrigins: bool = True
    roundGlyphMetrics: bool = True
    roundAnchors: bool = True

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        roundPathCoordinates = self.roundPathCoordinates
        roundComponentOrigins = self.roundComponentOrigins
        roundGlyphMetrics = self.roundGlyphMetrics
        roundAnchors = self.roundAnchors

        newLayers = {
            layerName: replace(
                layer,
                glyph=roundCoordinates(
                    layer.glyph,
                    roundPathCoordinates,
                    roundComponentOrigins,
                    roundGlyphMetrics,
                    roundAnchors,
                ),
            )
            for layerName, layer in glyph.layers.items()
        }
        return replace(glyph, layers=newLayers)


def roundCoordinates(
    glyph, roundPathCoordinates, roundComponentOrigins, roundGlyphMetrics, roundAnchors
):
    newFields = {}

    if roundPathCoordinates:
        newFields["path"] = glyph.path.rounded()

    if roundComponentOrigins:
        newFields["components"] = [
            replace(
                compo,
                transformation=replace(
                    compo.transformation,
                    translateX=otRound(compo.transformation.translateX),
                    translateY=otRound(compo.transformation.translateY),
                ),
            )
            for compo in glyph.components
        ]

    if roundGlyphMetrics:
        if glyph.xAdvance:
            newFields["xAdvance"] = otRound(glyph.xAdvance)
        if glyph.yAdvance:
            newFields["yAdvance"] = otRound(glyph.yAdvance)
        if glyph.verticalOrigin:
            newFields["verticalOrigin"] = otRound(glyph.verticalOrigin)

    if roundAnchors:
        newFields["anchors"] = [
            replace(anchor, x=otRound(anchor.x), y=otRound(anchor.y))
            for anchor in glyph.anchors
        ]

    return replace(glyph, **newFields)


@registerFilterAction("generate-palt-feature")
@dataclass(kw_only=True)
class GeneratePaltFeature(BaseFilter):
    languageSystems: list[tuple[str, str]] = field(default_factory=list)

    async def processFeatures(self, features):
        glyphMap = await self.getGlyphMap()

        axes = await self.getAxes()

        horizontalAdjustments = await self._collectAdjustments(glyphMap, axes.axes)

        if not horizontalAdjustments:
            return features

        axisList = [
            SimpleNamespace(
                axisTag=axis.tag,
                minValue=axis.minValue,
                defaultValue=axis.defaultValue,
                maxValue=axis.maxValue,
            )
            for axis in axes.axes
        ]

        axisTagMapping = {axis.name: axis.tag for axis in axes.axes}

        w = FeatureWriter()
        for script, language in self.languageSystems:
            w.addLanguageSystem(script, language)

        fea = w.addFeature("palt")
        for glyphName, adjustments in horizontalAdjustments.items():
            if len(adjustments) == 1:
                _, placementScalar, advanceScalar = adjustments[0]
            else:
                placementScalar = VariableScalar()
                placementScalar.axes = axisList
                advanceScalar = VariableScalar()
                advanceScalar.axes = axisList
                for location, placementAdjust, advanceAdjust in adjustments:
                    location = {axisTagMapping[k]: v for k, v in location.items()}
                    locationTuple = tuplifyLocation(location)
                    placementScalar.add_value(locationTuple, placementAdjust)
                    advanceScalar.add_value(locationTuple, advanceAdjust)
            fea.addLine(f"pos {glyphName} <{placementScalar} 0 {advanceScalar} 0>")

        featureText = w.asFea()

        featureText, _ = mergeFeatures(features.text, glyphMap, featureText, glyphMap)
        return OpenTypeFeatures(text=featureText)

    async def _collectAdjustments(self, glyphMap, axes):
        mapFuncs = {}
        for axis in axes:
            if axis.mapping:
                forwardMap = dict([(a, b) for a, b in axis.mapping])
                userRange = [axis.minValue, axis.defaultValue, axis.maxValue]
                sourceRange = [
                    piecewiseLinearMap(value, forwardMap) for value in userRange
                ]
                backwardMap = list(zip(sourceRange, userRange))
                mapFuncs[axis.name] = partial(
                    piecewiseLinearMap,
                    mapping=dict(backwardMap),
                )
            else:
                mapFuncs[axis.name] = lambda v: v

        horizontalAdjustments = {}
        for glyphName in glyphMap:
            try:
                glyph = await self.getGlyph(glyphName)
            except Exception as e:
                logger.error(
                    f"{self.actionName}: glyph {glyphName} caused an error: {e!r}"
                )
                continue

            glyph = await self.getGlyph(glyphName)
            adjustments = []
            for source in getActiveSources(glyph.sources):
                layerGlyph = glyph.layers[source.layerName].glyph
                lsbAnchorPos = None
                rsbAnchorPos = None
                for anchor in layerGlyph.anchors:
                    if anchor.name == "LSB":
                        lsbAnchorPos = anchor.x
                    elif anchor.name == "RSB":
                        rsbAnchorPos = anchor.x
                if lsbAnchorPos is not None and rsbAnchorPos is not None:
                    placementAdjust = -lsbAnchorPos
                    advanceAdjust = rsbAnchorPos - lsbAnchorPos - layerGlyph.xAdvance
                    location = {
                        name: mapFuncs[name](value)
                        for name, value in source.location.items()
                    }
                    adjustments.append((location, placementAdjust, advanceAdjust))
            if adjustments:
                horizontalAdjustments[glyphName] = adjustments

        return horizontalAdjustments
