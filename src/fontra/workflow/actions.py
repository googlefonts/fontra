from __future__ import annotations

import logging
import os
import pathlib
from contextlib import aclosing, asynccontextmanager
from dataclasses import dataclass, field, replace
from functools import cached_property, partial
from typing import (
    Any,
    AsyncContextManager,
    AsyncGenerator,
    Protocol,
    get_type_hints,
    runtime_checkable,
)

from fontTools.misc.roundTools import otRound
from fontTools.misc.transform import Transform
from fontTools.varLib.models import piecewiseLinearMap

from ..backends import getFileSystemBackend, newFileSystemBackend
from ..backends.copy import copyFont
from ..core.classes import (
    Component,
    FontInfo,
    GlobalAxis,
    GlobalDiscreteAxis,
    GlobalSource,
    Layer,
    Source,
    StaticGlyph,
    VariableGlyph,
    structure,
    unstructure,
)
from ..core.instancer import FontInstancer, LocationCoordinateSystem
from ..core.path import PackedPathPointPen
from ..core.protocols import ReadableFontBackend

# All actions should use this logger, regardless of where they are defined
actionLogger = logging.getLogger(__name__)


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
    async def process(self) -> None:
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

    async def getGlobalAxes(self) -> list[GlobalAxis | GlobalDiscreteAxis]:
        axes = await self.validatedInput.getGlobalAxes()
        return await self.processGlobalAxes(axes)

    async def getSources(self) -> dict[str, GlobalSource]:
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

    async def processGlobalAxes(
        self, axes: list[GlobalAxis | GlobalDiscreteAxis]
    ) -> list[GlobalAxis | GlobalDiscreteAxis]:
        return axes

    async def processSources(
        self, sources: dict[str, GlobalSource]
    ) -> dict[str, GlobalSource]:
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
        glyphMap = await self._getSubsettedGlyphMap()
        if glyphName not in glyphMap:
            return None
        return await self.validatedInput.getGlyph(glyphName)

    async def getGlyphMap(self) -> dict[str, list[int]]:
        return await self._getSubsettedGlyphMap()

    async def _getSubsettedGlyphMap(self) -> dict[str, list[int]]:
        if self._glyphMap is None:
            self._glyphMap = await self._buildSubsettedGlyphMap(
                await self.validatedInput.getGlyphMap()
            )
        return self._glyphMap

    async def _buildSubsettedGlyphMap(
        self, originalGlyphMap: dict[str, list[int]]
    ) -> dict[str, list[int]]:
        # Override
        return originalGlyphMap


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
        glyphsToCheck = set(reachableGlyphs)
        while glyphsToCheck:
            glyphName = glyphsToCheck.pop()
            glyph = await self.validatedInput.getGlyph(glyphName)
            componentNames = getComponentNames(glyph)
            uncheckedGlyphs = componentNames - reachableGlyphs
            reachableGlyphs.update(uncheckedGlyphs)
            glyphsToCheck.update(uncheckedGlyphs)

        return {
            glyphName: codePoints
            for glyphName, codePoints in originalGlyphMap.items()
            if glyphName in reachableGlyphs
        }


def getComponentNames(glyph):
    return {
        compo.name
        for layer in glyph.layers.values()
        for compo in layer.glyph.components
    }


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
        subsettedGlyphMap = {}
        glyphNames = set(self.glyphNames)
        if not glyphNames and self.dropGlyphNames:
            glyphNames = set(originalGlyphMap)
        if self.dropGlyphNames:
            glyphNames = glyphNames - set(self.dropGlyphNames)

        while glyphNames:
            glyphName = glyphNames.pop()
            if glyphName not in originalGlyphMap:
                continue

            subsettedGlyphMap[glyphName] = originalGlyphMap[glyphName]

            # TODO: add getGlyphsMadeOf() ReadableFontBackend protocol member,
            # so backends can implement this more efficiently
            glyph = await self.validatedInput.getGlyph(glyphName)
            assert glyph is not None
            compoNames = {
                compo.name
                for layer in glyph.layers.values()
                for compo in layer.glyph.components
            }
            for compoName in compoNames:
                if compoName in originalGlyphMap and compoName not in subsettedGlyphMap:
                    glyphNames.add(compoName)

        return subsettedGlyphMap


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
            try:
                del self.validatedInput
            except AttributeError:
                pass

    async def process(self, outputDir: os.PathLike = pathlib.Path()) -> None:
        outputDir = pathlib.Path(outputDir)
        output = newFileSystemBackend((outputDir / self.destination).resolve())

        async with aclosing(output):
            await copyFont(self.validatedInput, output)


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

    async def processGlobalAxes(
        self, axes: list[GlobalAxis | GlobalDiscreteAxis]
    ) -> list[GlobalAxis | GlobalDiscreteAxis]:
        return [_renameAxis(axis, self.axes) for axis in axes]


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


@registerActionClass("drop-axis-mapping")
@dataclass(kw_only=True)
class DropAxisMappingAction(BaseFilterAction):
    axes: list[str] | None = None

    _axisValueMapFunctions: dict | None = field(init=False, default=None)

    async def _getAxisValueMapFunctions(self) -> dict:
        if self._axisValueMapFunctions is None:
            axes = await self.validatedInput.getGlobalAxes()
            if self.axes:
                axes = [axis for axis in axes if axis.name in self.axes]

            mapFuncs = {}
            for axis in axes:
                if axis.mapping:
                    mapFuncs[axis.name] = partial(
                        piecewiseLinearMap,
                        mapping=dict([(b, a) for a, b in axis.mapping]),
                    )
            self._axisValueMapFunctions = mapFuncs
        return self._axisValueMapFunctions

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        mapFuncs = await self._getAxisValueMapFunctions()
        return _remapSourceLocations(glyph, mapFuncs)

    async def processGlobalAxes(self, axes) -> list[GlobalAxis | GlobalDiscreteAxis]:
        mapFuncs = await self._getAxisValueMapFunctions()
        return [_dropAxisMapping(axis, mapFuncs) for axis in axes]


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

    _adjustedAxes: list[GlobalAxis | GlobalDiscreteAxis] | None = field(
        init=False, default=None
    )
    _axisValueMapFunctions: dict | None = field(init=False, default=None)

    async def _ensureSetup(self) -> None:
        if self._adjustedAxes is not None:
            return
        mapFuncs: dict = {}
        axes = await self.validatedInput.getGlobalAxes()
        adjustedAxes = []
        for axis in axes:
            newValues = self.axes.get(axis.name)
            if newValues is not None:
                if isinstance(axis, GlobalDiscreteAxis):
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
        self._adjustedAxes = adjustedAxes
        self._axisValueMapFunctions = mapFuncs

    async def processGlobalAxes(self, axes) -> list[GlobalAxis | GlobalDiscreteAxis]:
        await self._ensureSetup()
        assert self._adjustedAxes is not None
        return self._adjustedAxes

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        return _remapSourceLocations(glyph, self._axisValueMapFunctions)


@registerActionClass("decompose-composites")
@dataclass(kw_only=True)
class DecomposeCompositesAction(BaseFilterAction):
    onlyVariableComposites: bool = False

    @cached_property
    def fontInstancer(self):
        return FontInstancer(self.validatedInput)

    async def getGlyph(self, glyphName: str) -> VariableGlyph:
        instancer = await self.fontInstancer.getGlyphInstancer(glyphName)
        glyph = instancer.glyph
        defaultGlobalLocation = instancer.defaultGlobalLocation

        if not instancer.componentTypes or (
            self.onlyVariableComposites and not any(instancer.componentTypes)
        ):
            return glyph

        haveLocations = getGlobalLocationsFromSources(
            instancer.activeSources, defaultGlobalLocation
        )

        needLocations = await getGlobalLocationsFromBaseGlyphs(
            glyph, self.fontInstancer.backend, defaultGlobalLocation
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
            pen = PackedPathPointPen()
            instance = await instancer.drawPoints(
                pen,
                source.location,
                coordSystem=LocationCoordinateSystem.SOURCE,
                decomposeComponents=True,
                decomposeVarComponents=True,
            )

            newLayers[source.layerName] = Layer(
                glyph=replace(instance.glyph, path=pen.getPath(), components=[]),
            )

        return replace(glyph, sources=newSources, layers=newLayers)


async def getGlobalLocationsFromBaseGlyphs(
    glyph, backend, defaultGlobalLocation, seenGlyphNames=None
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
            getGlobalLocationsFromSources(
                getActiveSources(baseGlyph.sources), defaultGlobalLocation
            )
        )

    seenGlyphNames |= baseGlyphNames

    for baseGlyph in baseGlyphs:
        locations.update(
            await getGlobalLocationsFromBaseGlyphs(
                baseGlyph, backend, defaultGlobalLocation, seenGlyphNames
            )
        )

    return locations


def getGlobalLocationsFromSources(sources, defaultGlobalLocation):
    return {
        tuplifyLocation(
            defaultGlobalLocation
            | {k: v for k, v in source.location.items() if k in defaultGlobalLocation}
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
            actionLogger.error(f"set-font-info: unknown name(s): {extraNamesString}")
        return structure(unstructure(fontInfo) | self.fontInfo, FontInfo)


@registerActionClass("subset-axes")
@dataclass(kw_only=True)
class SubsetAxesAction(BaseFilterAction):
    axisNames: set[str] = field(default_factory=set)
    dropAxisNames: set[str] = field(default_factory=set)

    def __post_init__(self):
        self.axisNames = set(self.axisNames)
        self.dropAxisNames = set(self.dropAxisNames)
        self._locationToKeep = None

    def getAxisNamesToKeep(self, axes):
        axisNames = (
            set(axis.name for axis in axes)
            if not self.axisNames and self.dropAxisNames
            else self.axisNames
        )
        return axisNames - self.dropAxisNames

    async def getLocationToKeep(self):
        if self._locationToKeep is None:
            axes = await self.validatedInput.getGlobalAxes()
            keepAxisNames = self.getAxisNamesToKeep(axes)
            location = getDefaultSourceLocation(axes)
            self._locationToKeep = {
                n: v for n, v in location.items() if n not in keepAxisNames
            }
        return self._locationToKeep

    async def processGlobalAxes(
        self, axes: list[GlobalAxis | GlobalDiscreteAxis]
    ) -> list[GlobalAxis | GlobalDiscreteAxis]:
        keepAxisNames = self.getAxisNamesToKeep(axes)
        return [axis for axis in axes if axis.name in keepAxisNames]

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        # locationToKeep contains axis *values* for sources we want to keep,
        # but those axes are to be dropped, so it *also* says "axes to drop"
        locationToKeep = await self.getLocationToKeep()

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
