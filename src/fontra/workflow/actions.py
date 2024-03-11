from __future__ import annotations

import logging
import os
import pathlib
from contextlib import aclosing, asynccontextmanager
from dataclasses import dataclass, field, replace
from functools import cached_property, partial
from typing import Any, AsyncContextManager, AsyncGenerator, Protocol, runtime_checkable

from fontTools.misc.roundTools import otRound
from fontTools.misc.transform import Transform
from fontTools.varLib.models import piecewiseLinearMap

from ..backends import getFileSystemBackend, newFileSystemBackend
from ..backends.copy import copyFont
from ..core.classes import (
    Component,
    GlobalAxis,
    GlobalDiscreteAxis,
    StaticGlyph,
    VariableGlyph,
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

    async def getGlobalAxes(self) -> list[GlobalAxis | GlobalDiscreteAxis]:
        axes = await self.validatedInput.getGlobalAxes()
        return await self.processGlobalAxes(axes)

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

    async def processGlobalAxes(
        self, axes: list[GlobalAxis | GlobalDiscreteAxis]
    ) -> list[GlobalAxis | GlobalDiscreteAxis]:
        return axes

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


@registerActionClass("subset")
@dataclass(kw_only=True)
class SubsetAction(BaseFilterAction):
    glyphNames: set[str] = field(default_factory=set)
    glyphNamesFile: str | None = None

    def __post_init__(self):
        if self.glyphNamesFile:
            path = pathlib.Path(self.glyphNamesFile)
            assert path.is_file()
            glyphNames = set(path.read_text().split())
            self.glyphNames = self.glyphNames | glyphNames
        self._glyphMap = None

    async def _getSubsettedGlyphMap(self) -> dict[str, list[int]]:
        if self._glyphMap is None:
            bigGlyphMap = await self.validatedInput.getGlyphMap()
            subsettedGlyphMap = {}
            glyphNames = set(self.glyphNames)
            while glyphNames:
                glyphName = glyphNames.pop()
                if glyphName not in bigGlyphMap:
                    continue

                subsettedGlyphMap[glyphName] = bigGlyphMap[glyphName]

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
                    if compoName in bigGlyphMap and compoName not in subsettedGlyphMap:
                        glyphNames.add(compoName)

            self._glyphMap = subsettedGlyphMap
        return self._glyphMap

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        glyphMap = await self._getSubsettedGlyphMap()
        if glyphName not in glyphMap:
            return None
        return await self.validatedInput.getGlyph(glyphName)

    async def getGlyphMap(self) -> dict[str, list[int]]:
        return await self._getSubsettedGlyphMap()


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
    onlyVariableComponents: bool = False

    @cached_property
    def fontInstancer(self):
        return FontInstancer(self.validatedInput)

    async def getGlyph(self, glyphName: str) -> VariableGlyph:
        instancer = await self.fontInstancer.getGlyphInstancer(glyphName)
        glyph = instancer.glyph

        if not instancer.componentTypes or (
            self.onlyVariableComponents and not any(instancer.componentTypes)
        ):
            return glyph

        newLayers = {}
        for source in instancer.activeSources:
            pen = PackedPathPointPen()
            await instancer.drawPoints(
                pen,
                source.location,
                coordSystem=LocationCoordinateSystem.SOURCE,
                decomposeComponents=True,
                decomposeVarComponents=True,
            )

            layer = glyph.layers[source.layerName]
            newLayers[source.layerName] = replace(
                layer,
                glyph=replace(layer.glyph, path=pen.getPath(), components=[]),
            )

        glyph = replace(glyph, layers=newLayers)

        return glyph


def getActiveSources(sources):
    return [source for source in sources if not source.inactive]
