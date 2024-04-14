from __future__ import annotations

import json
import logging
import os
import pathlib
import tempfile
from contextlib import aclosing, asynccontextmanager
from copy import deepcopy
from dataclasses import dataclass, field, replace
from functools import cached_property, partial
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
from ..core.async_property import async_cached_property
from ..core.classes import (
    Axes,
    Component,
    DiscreteFontAxis,
    FontInfo,
    FontSource,
    Layer,
    Source,
    StaticGlyph,
    VariableGlyph,
    structure,
    unstructure,
)
from ..core.instancer import FontInstancer
from ..core.path import PackedPath
from ..core.protocols import ReadableFontBackend

# All actions should use this logger, regardless of where they are defined
logger = logging.getLogger(__name__)


class ActionError(Exception):
    pass


@runtime_checkable
class ConnectableActionProtocol(Protocol):
    def connect(
        self, input: ReadableFontBackend
    ) -> AsyncContextManager[ReadableFontBackend | OutputActionProtocol]:
        pass


@runtime_checkable
class InputActionProtocol(Protocol):
    def prepare(self) -> AsyncContextManager[ReadableFontBackend]:
        pass


@runtime_checkable
class OutputActionProtocol(Protocol):
    async def process(
        self, outputDir: os.PathLike = pathlib.Path(), *, continueOnError=False
    ) -> None:
        pass


_actions = {}


def registerActionClass(name):
    def wrapper(cls):
        assert name not in _actions
        cls.actionName = name
        _actions[name] = cls
        return cls

    return wrapper


def getActionClass(name):
    cls = _actions.get(name)
    if cls is None:
        raise KeyError(f"No action found named '{name}'")
    return cls


@dataclass(kw_only=True)
class BaseFilterAction:
    input: ReadableFontBackend | None = field(init=False, default=None)
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

    @asynccontextmanager
    async def connect(
        self, input: ReadableFontBackend
    ) -> AsyncGenerator[ReadableFontBackend | OutputActionProtocol, None]:
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
        glyphMap = await self.validatedInput.getGlyphMap()
        return await self.processGlyphMap(glyphMap)

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

    async def processCustomData(self, customData):
        return customData

    async def processUnitsPerEm(self, unitsPerEm: int) -> int:
        return unitsPerEm


@registerActionClass("scale")
@dataclass(kw_only=True)
class ScaleAction(BaseFilterAction):
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
        # TODO: anchors, guidelines
        return replace(
            glyph,
            xAdvance=xAdvance,
            yAdvance=yAdvance,
            verticalOrigin=verticalOrigin,
            path=glyph.path.transformed(transformation),
            components=[
                self._scaleComponentOrigin(component) for component in glyph.components
            ],
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
class BaseGlyphSubsetterAction(BaseFilterAction):
    _glyphMap: dict[str, list[int]] | None = field(init=False, repr=False, default=None)

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        glyphMap = await self.subsettedGlyphMap
        if glyphName not in glyphMap:
            return None
        return await self.validatedInput.getGlyph(glyphName)

    async def getGlyphMap(self) -> dict[str, list[int]]:
        return await self.subsettedGlyphMap

    @async_cached_property
    async def subsettedGlyphMap(self) -> dict[str, list[int]]:
        return await self._buildSubsettedGlyphMap(
            await self.validatedInput.getGlyphMap()
        )

    async def _buildSubsettedGlyphMap(
        self, originalGlyphMap: dict[str, list[int]]
    ) -> dict[str, list[int]]:
        # Override
        return originalGlyphMap

    async def _componentsClosure(self, glyphNames) -> set[str]:
        glyphsToCheck = set(glyphNames)  # this set will shrink
        glyphNamesExpanded = set(glyphNames)  # this set may grow

        while glyphsToCheck:
            glyphName = glyphsToCheck.pop()

            try:
                glyph = await self.validatedInput.getGlyph(glyphName)
                assert glyph is not None, f"Unexpected missing glyph {glyphName}"
            except Exception as e:
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


@registerActionClass("drop-unreachable-glyphs")
@dataclass(kw_only=True)
class DropUnreachableGlyphsAction(BaseGlyphSubsetterAction):

    async def _buildSubsettedGlyphMap(
        self, originalGlyphMap: dict[str, list[int]]
    ) -> dict[str, list[int]]:
        reachableGlyphs = {
            glyphName
            for glyphName, codePoints in originalGlyphMap.items()
            if codePoints
        }

        reachableGlyphs = await self._componentsClosure(reachableGlyphs)
        return filterGlyphMap(originalGlyphMap, reachableGlyphs)


@registerActionClass("subset-glyphs")
@dataclass(kw_only=True)
class SubsetGlyphsAction(BaseGlyphSubsetterAction):
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

    async def _buildSubsettedGlyphMap(
        self, originalGlyphMap: dict[str, list[int]]
    ) -> dict[str, list[int]]:
        glyphNames = set(self.glyphNames)
        if not glyphNames and self.dropGlyphNames:
            glyphNames = set(originalGlyphMap)
        if self.dropGlyphNames:
            glyphNames = glyphNames - set(self.dropGlyphNames)

        glyphNames = await self._componentsClosure(glyphNames)
        return filterGlyphMap(originalGlyphMap, glyphNames)


@registerActionClass("input")
@dataclass(kw_only=True)
class InputAction:
    source: str

    @asynccontextmanager
    async def prepare(self) -> AsyncGenerator[ReadableFontBackend, None]:
        backend = getFileSystemBackend(pathlib.Path(self.source).resolve())
        try:
            yield backend
        finally:
            await backend.aclose()


@registerActionClass("output")
@dataclass(kw_only=True)
class OutputAction:
    destination: str
    input: ReadableFontBackend | None = field(init=False, default=None)

    @cached_property
    def validatedInput(self) -> ReadableFontBackend:
        assert isinstance(self.input, ReadableFontBackend)
        return self.input

    @asynccontextmanager
    async def connect(
        self, input: ReadableFontBackend
    ) -> AsyncGenerator[ReadableFontBackend | OutputActionProtocol, None]:
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


@registerActionClass("rename-axes")
@dataclass(kw_only=True)
class RenameAxesAction(BaseFilterAction):
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


@registerActionClass("drop-unused-sources-and-layers")
@dataclass(kw_only=True)
class DropInactiveSourcesAction(BaseFilterAction):
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


@registerActionClass("drop-axis-mappings")
@dataclass(kw_only=True)
class DropAxisMappingsAction(BaseFilterAction):
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


@registerActionClass("adjust-axes")
@dataclass(kw_only=True)
class AdjustAxesAction(BaseFilterAction):
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
                if isinstance(axis, DiscreteFontAxis):
                    raise ActionError("adjust-axes: discrete axes are not supported")
                names = {"minValue", "defaultValue", "maxValue"}
                newValues = {k: v for k, v in newValues.items() if k in names}
                newAxis = replace(axis, **newValues)

                if self.remapSources:
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


@registerActionClass("decompose-composites")
@dataclass(kw_only=True)
class DecomposeCompositesAction(BaseFilterAction):
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

        locationsToAdd = [
            dict(location) for location in sorted(needLocations - haveLocations)
        ]
        layerNames = [locationToString(location) for location in locationsToAdd]

        newSources = instancer.activeSources + [
            Source(name=name, location=location, layerName=name)
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
):
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


def getFontSourceLocationsFromSources(sources, defaultFontSourceLocation):
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


def getActiveSources(sources):
    return [source for source in sources if not source.inactive]


fontInfoNames = set(get_type_hints(FontInfo))


@registerActionClass("set-font-info")
@dataclass(kw_only=True)
class SetFontInfoAction(BaseFilterAction):
    fontInfo: dict[str, str]

    async def processFontInfo(self, fontInfo):
        extraNames = set(self.fontInfo) - fontInfoNames
        if extraNames:
            extraNamesString = ", ".join(repr(n) for n in sorted(extraNames))
            logger.error(f"set-font-info: unknown name(s): {extraNamesString}")
        return structure(unstructure(fontInfo) | self.fontInfo, FontInfo)


@registerActionClass("subset-axes")
@dataclass(kw_only=True)
class SubsetAxesAction(BaseFilterAction):
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


@registerActionClass("move-default-location")
@dataclass(kw_only=True)
class MoveDefaultLocationAction(BaseFilterAction):
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


@registerActionClass("trim-axes")
@dataclass(kw_only=True)
class TrimAxesAction(BaseFilterAction):
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

        _, sourceRanges = await self._trimmedAxesAndSourceRanges

        for loc in newLocations:
            for axisName, value in loc.items():
                if axisName not in sourceRanges:
                    continue
                minValue, maxValue = sourceRanges[axisName]
                trimmedValue = max(min(value, maxValue), minValue)
                loc[axisName] = trimmedValue

        return updateSourcesAndLayers(instancer, newLocations)


def updateSourcesAndLayers(instancer, newLocations) -> VariableGlyph:
    glyph = instancer.glyph

    sourcesByLocation = {
        tuplifyLocation(source.location): source for source in instancer.activeSources
    }
    locationTuples = sorted({tuplifyLocation(loc) for loc in newLocations})

    newSources = []
    newLayers = {}

    for locationTuple in locationTuples:
        source = sourcesByLocation.get(locationTuple)
        if source is not None:
            newLayers[source.layerName] = glyph.layers[source.layerName]
        else:
            location = dict(locationTuple)
            name = locationToString(location)
            source = Source(name=name, location=location, layerName=name)
            instance = instancer.instantiate(location)
            newLayers[source.layerName] = Layer(glyph=instance.glyph)

        newSources.append(source)

    return dropUnusedSourcesAndLayers(
        replace(glyph, sources=newSources, layers=newLayers)
    )


@registerActionClass("check-interpolation")
@dataclass(kw_only=True)
class CheckInterpolationAction(BaseFilterAction):

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        # Each of the next two lines may raise an error if the glyph
        # doesn't interpolate
        instancer = await self.fontInstancer.getGlyphInstancer(glyphName)
        _ = instancer.deltas
        return instancer.glyph


@registerActionClass("memory-cache")
@dataclass(kw_only=True)
class MemoryCacheAction(BaseFilterAction):
    def __post_init__(self):
        self._glyphCache = {}

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        if glyphName not in self._glyphCache:
            self._glyphCache[glyphName] = await self.validatedInput.getGlyph(glyphName)
        return self._glyphCache[glyphName]


@registerActionClass("disk-cache")
@dataclass(kw_only=True)
class DiskCacheAction(BaseFilterAction):
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


@registerActionClass("subset-by-development-status")
@dataclass(kw_only=True)
class SubsetByDevelopmentStatusAction(BaseGlyphSubsetterAction):
    statuses: list[int]
    sourceSelectBehavior: str = (
        "default"  # "any", "all" or "default" (the default source)
    )

    async def _buildSubsettedGlyphMap(
        self, originalGlyphMap: dict[str, list[int]]
    ) -> dict[str, list[int]]:
        statuses = set(self.statuses)
        selectedGlyphs = set()

        for glyphName in originalGlyphMap:
            if self.sourceSelectBehavior == "default":
                try:
                    instancer = await self.fontInstancer.getGlyphInstancer(glyphName)
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

        selectedGlyphs = await self._componentsClosure(selectedGlyphs)
        return filterGlyphMap(originalGlyphMap, selectedGlyphs)


@registerActionClass("drop-shapes")
@dataclass(kw_only=True)
class DropShapesAction(BaseFilterAction):

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        return replace(
            glyph,
            layers={
                layerName: replace(
                    layer, glyph=replace(layer.glyph, path=PackedPath(), components=[])
                )
                for layerName, layer in glyph.layers.items()
            },
        )
