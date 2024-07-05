from __future__ import annotations

import logging
from dataclasses import dataclass, replace
from enum import Enum
from functools import cached_property, singledispatch
from typing import Any, Iterable

from fontTools.misc.transform import DecomposedTransform, Transform
from fontTools.varLib.models import piecewiseLinearMap

from .async_property import async_cached_property
from .classes import (
    Anchor,
    Component,
    DiscreteFontAxis,
    FontAxis,
    FontSource,
    GlyphAxis,
    GlyphSource,
    Guideline,
    Layer,
    LineMetric,
    StaticGlyph,
    VariableGlyph,
)
from .discretevariationmodel import DiscreteDeltas, DiscreteVariationModel
from .lrucache import LRUCache
from .path import InterpolationError, PackedPath, joinPaths
from .protocols import ReadableFontBackend
from .varutils import (
    locationToTuple,
    makeDenseLocation,
    mapAxesFromUserSpaceToSourceSpace,
)

logger = logging.getLogger(__name__)


class LocationCoordinateSystem(Enum):
    USER = 1
    SOURCE = 2  # "designspace coords"


class GlyphNotFoundError(Exception):
    pass


@dataclass
class FontInstancer:
    backend: ReadableFontBackend
    failOnInterpolationError: bool = False

    def __post_init__(self) -> None:
        self.glyphInstancers: dict[str, GlyphInstancer] = {}
        self._fontAxes: list[FontAxis | DiscreteFontAxis] | None = None
        self._glyphErrors: set[str] = set()

    async def _ensureSetup(self):
        if self._fontAxes is None:
            self._fontAxes = (await self.backend.getAxes()).axes

    @cached_property
    def fontAxes(self) -> list[FontAxis | DiscreteFontAxis]:
        assert self._fontAxes is not None
        return self._fontAxes

    @cached_property
    def fontAxisNames(self) -> set[str]:
        return {axis.name for axis in self.fontAxes}

    @async_cached_property
    async def fontSourcesInstancer(self):
        await self._ensureSetup()
        return FontSourcesInstancer(
            fontAxes=self.fontAxes, fontSources=await self.backend.getSources()
        )

    async def getGlyphInstancer(
        self,
        glyphName: str,
        addToCache: bool = False,
        fixComponentLocationCompatibility: bool = True,
    ) -> GlyphInstancer:
        await self._ensureSetup()
        glyphInstancer = self.glyphInstancers.get(glyphName)
        if glyphInstancer is None:
            glyph = await self.backend.getGlyph(glyphName)
            if glyph is None:
                raise GlyphNotFoundError(glyphName)
            if fixComponentLocationCompatibility:
                glyph = await self._ensureComponentLocationCompatibility(glyph)
            glyphInstancer = GlyphInstancer(glyph, self)
            if addToCache:
                self.glyphInstancers[glyphName] = glyphInstancer
        return glyphInstancer

    def glyphError(self, errorMessage):
        if errorMessage not in self._glyphErrors:
            logger.error(errorMessage)
            self._glyphErrors.add(errorMessage)

    async def _ensureComponentLocationCompatibility(
        self, glyph: VariableGlyph
    ) -> VariableGlyph:
        layerGlyphs = {
            source.layerName: glyph.layers[source.layerName].glyph
            for source in glyph.sources
            if not source.inactive
        }

        componentConfigs = {
            tuple(component.name for component in layerGlyph.components)
            for layerGlyph in layerGlyphs.values()
        }
        if len(componentConfigs) != 1:
            message = f"glyph {glyph.name}: components are not interpolatable"
            if self.failOnInterpolationError:
                raise InterpolationError(message)
            else:
                self.glyphError(message)
                return glyph

        ok, componentAxisNames = _areComponentLocationsCompatible(layerGlyphs.values())
        if ok:
            # All good
            return glyph

        componentGlyphNames = set(list(componentConfigs)[0])

        baseGlyphs = [
            (glyphName, await self.getGlyphInstancer(glyphName, True))
            for glyphName in componentGlyphNames
        ]

        axisDefaults = {
            glyphName: {axis.name: axis.defaultValue for axis in baseGlyph.combinedAxes}
            for glyphName, baseGlyph in baseGlyphs
        }

        return _fixComponentLocationsCompatibility(
            glyph, layerGlyphs, componentAxisNames, axisDefaults
        )


def _areComponentLocationsCompatible(
    glyphs: Iterable[StaticGlyph],
) -> tuple[bool, list[set[str]]]:
    ok = True
    numComponents = None
    componentAxisNames: list[Any] | None = None

    for glyph in glyphs:
        if numComponents is None:
            numComponents = len(glyph.components)
            componentAxisNames = [None] * numComponents

        for i in range(numComponents):
            compo = glyph.components[i]
            axisNames = set(compo.location)
            if componentAxisNames[i] is None:
                componentAxisNames[i] = axisNames
            elif axisNames != componentAxisNames[i]:
                ok = False
                componentAxisNames[i] |= axisNames

    assert componentAxisNames is not None

    return ok, componentAxisNames


def _fixComponentLocationsCompatibility(
    glyph: VariableGlyph,
    layerGlyphs: dict,
    componentAxisNames: list[set[str]],
    axisDefaults,
) -> VariableGlyph:
    return replace(
        glyph,
        layers={
            layerName: Layer(
                glyph=replace(
                    layerGlyph,
                    components=[
                        _fixComponentLocation(
                            compo, axisNames, axisDefaults[compo.name]
                        )
                        for compo, axisNames in zip(
                            layerGlyph.components, componentAxisNames, strict=True
                        )
                    ],
                )
            )
            for layerName, layerGlyph in layerGlyphs.items()
        },
    )


def _fixComponentLocation(
    component: Component, axisNames: set[str], axisDefaults: dict[str, float]
):
    return replace(
        component,
        location={
            axisName: component.location.get(axisName, axisDefaults.get(axisName, 0))
            for axisName in sorted(axisNames)
        },
    )


@dataclass
class GlyphInstancer:
    glyph: VariableGlyph
    fontInstancer: FontInstancer

    async def drawPoints(
        self,
        pen,
        location,
        *,
        coordSystem=LocationCoordinateSystem.USER,
        decomposeComponents=False,
        decomposeVarComponents=True,
    ) -> GlyphInstance:
        if coordSystem == LocationCoordinateSystem.USER:
            location = mapLocationFromUserToSource(location, self.fontAxes)

        instance = self.instantiate(location)
        await instance.drawPoints(
            pen,
            decomposeComponents=decomposeComponents,
            decomposeVarComponents=decomposeVarComponents,
        )
        return instance

    @cached_property
    def fontAxisNames(self) -> set[str]:
        return self.fontInstancer.fontAxisNames - {
            axis.name for axis in self.glyph.axes
        }

    def instantiate(
        self, location, *, coordSystem=LocationCoordinateSystem.SOURCE
    ) -> GlyphInstance:
        if coordSystem == LocationCoordinateSystem.USER:
            location = mapLocationFromUserToSource(location, self.fontAxes)

        try:
            result = self.model.interpolateFromDeltas(location, self.deltas)
        except Exception as e:
            if self.fontInstancer.failOnInterpolationError:
                raise
            self.fontInstancer.glyphError(
                f"glyph {self.glyph.name} caused an error: {e!r}"
            )
            # Fall back to default source
            instantiatedGlyph = self.glyph.layers[self.fallbackSource.layerName].glyph
            componentTypes = [
                bool(
                    compo.location
                    or compo.transformation.tCenterX
                    or compo.transformation.tCenterY
                )
                for compo in instantiatedGlyph.components
            ]
        else:
            assert isinstance(result.instance, MathWrapper)
            assert isinstance(result.instance.subject, StaticGlyph)
            instantiatedGlyph = result.instance.subject
            componentTypes = self.componentTypes

        # Only font axis values can be inherited, so filter out glyph axes
        fontAxisNames = self.fontAxisNames
        parentLocation = {
            name: value for name, value in location.items() if name in fontAxisNames
        }

        return GlyphInstance(
            self.glyph.name,
            instantiatedGlyph,
            componentTypes,
            parentLocation,
            self.fontInstancer,
        )

    @cached_property
    def fontAxes(self) -> list[FontAxis | DiscreteFontAxis]:
        return self.fontInstancer.fontAxes

    @cached_property
    def defaultFontSourceLocation(self) -> dict[str, float]:
        location = {axis.name: axis.defaultValue for axis in self.fontAxes}
        return mapLocationFromUserToSource(location, self.fontAxes)

    @cached_property
    def defaultSourceLocation(self) -> dict[str, float]:
        return {axis.name: axis.defaultValue for axis in self.combinedAxes}

    @cached_property
    def defaultSource(self) -> GlyphSource | None:
        defaultSourceLocation = self.defaultSourceLocation
        for source in self.activeSources:
            if defaultSourceLocation | source.location == defaultSourceLocation:
                return source
        return None

    @cached_property
    def fallbackSource(self) -> GlyphSource:
        source = self.defaultSource
        if source is None:
            source = self.activeSources[0]
        return source

    @cached_property
    def componentTypes(self) -> list[bool]:
        """A list with a boolean for each component: True if the component is
        variable (has a non-empty location) and False if it is a "classic"
        component.
        """
        # TODO: also return True for components that vary their non-translate
        # transformation fields
        numComponents = len(self.activeLayerGlyphs[0].components)
        return [
            any(
                compo.location
                or compo.transformation.tCenterX
                or compo.transformation.tCenterY
                for compo in (
                    layerGlyph.components[i] for layerGlyph in self.activeLayerGlyphs
                )
            )
            for i in range(numComponents)
        ]

    @cached_property
    def combinedAxes(self) -> list[FontAxis | DiscreteFontAxis | GlyphAxis]:
        glyphAxisNames = {axis.name for axis in self.glyph.axes}
        fontAxes = [axis for axis in self.fontAxes if axis.name not in glyphAxisNames]
        fontAxes = mapAxesFromUserSpaceToSourceSpace(fontAxes)
        return self.glyph.axes + fontAxes

    @cached_property
    def combinedAxisNames(self) -> set[str]:
        return {axis.name for axis in self.combinedAxes}

    @cached_property
    def activeSources(self) -> list[GlyphSource]:
        return [source for source in self.glyph.sources if not source.inactive]

    @cached_property
    def activeLayerGlyphs(self) -> list[StaticGlyph]:
        layers = self.glyph.layers
        return [layers[source.layerName].glyph for source in self.activeSources]

    @cached_property
    def model(self) -> DiscreteVariationModel:
        locations = [source.location for source in self.activeSources]
        return DiscreteVariationModel(locations, self.combinedAxes, softFail=False)

    @cached_property
    def deltas(self) -> DiscreteDeltas:
        sourceValues = [
            MathWrapper(layerGlyph) for layerGlyph in self.activeLayerGlyphs
        ]
        return self.model.getDeltas(sourceValues)

    def checkCompatibility(self):
        return self.model.checkCompatibilityFromDeltas(self.deltas)


@dataclass
class GlyphInstance:
    glyphName: str
    glyph: StaticGlyph
    componentTypes: list[bool]
    parentLocation: dict[str, float]  # LocationCoordinateSystem.SOURCE
    fontInstancer: FontInstancer

    async def getDecomposedPath(self, transform: Transform | None = None) -> PackedPath:
        assert isinstance(self.glyph.path, PackedPath)
        paths: list[PackedPath] = [
            (
                self.glyph.path
                if transform is None
                else self.glyph.path.transformed(transform)
            )
        ]
        for component in self.glyph.components:
            paths.append(await self._getComponentPath(component, transform))
        return joinPaths(paths)

    async def drawPoints(
        self,
        pen,
        *,
        decomposeComponents=False,
        decomposeVarComponents=False,
    ):
        assert self.componentTypes is not None
        assert self.parentLocation is not None

        paths = [self.glyph.path]
        components = []

        for component, isVarComponent in zip(
            self.glyph.components, self.componentTypes, strict=True
        ):
            if decomposeComponents or (isVarComponent and decomposeVarComponents):
                paths.append(await self._getComponentPath(component))
            else:
                components.append((component, isVarComponent))

        for path in paths:
            path.drawPoints(pen)

        for component, isVarComponent in components:
            if isVarComponent:
                pen.addVarComponent(
                    component.name,
                    component.transformation,
                    self.parentLocation | component.location,
                )
            else:
                pen.addComponent(component.name, component.transformation.toTransform())

    async def _getComponentPath(
        self, component, parentTransform: Transform | None = None
    ) -> PackedPath:
        try:
            instancer = await self.fontInstancer.getGlyphInstancer(component.name, True)
        except GlyphNotFoundError:
            self.fontInstancer.glyphError(
                f"glyph {self.glyphName} references non-existing glyph: {component.name}"
            )
            return PackedPath()

        instance = instancer.instantiate(self.parentLocation | component.location)
        transform = component.transformation.toTransform()
        if parentTransform is not None:
            transform = parentTransform.transform(transform)
        return await instance.getDecomposedPath(transform)


@dataclass(kw_only=True)
class FontSourcesInstancer:
    fontAxes: list[FontAxis | DiscreteFontAxis]
    fontSources: dict[str, FontSource]

    def __post_init__(self) -> None:
        self.fontSourcesDense = {
            sourceIdentifier: source
            for sourceIdentifier, source in self.fontSources.items()
            if not source.isSparse
        }
        assert self.fontAxes is not None
        self.fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(self.fontAxes)
        self.fontAxisNames = {axis.name for axis in self.fontAxes}
        self.defaultSourceLocation = {
            axis.name: axis.defaultValue for axis in self.fontAxesSourceSpace
        }
        self.sourceIdsByLocation = {
            locationToTuple(
                makeDenseLocation(source.location, self.defaultSourceLocation)
            ): sourceIdentifier
            for sourceIdentifier, source in self.fontSourcesDense.items()
        }
        self._instanceCache = LRUCache(50)

    @cached_property
    def model(self):
        locations = [
            makeDenseLocation(source.location, self.defaultSourceLocation)
            for source in self.fontSourcesDense.values()
        ]
        return DiscreteVariationModel(
            locations, self.fontAxesSourceSpace, softFail=False
        )

    @cached_property
    def deltas(self):
        guidelinesAreCompatible = areGuidelinesCompatible(
            list(self.fontSourcesDense.values())
        )

        fixedSourceValues = [
            MathWrapper(
                replace(
                    source,
                    location={},
                    name="",
                    guidelines=source.guidelines if guidelinesAreCompatible else [],
                )
            )
            for source in self.fontSourcesDense.values()
        ]
        return self.model.getDeltas(fixedSourceValues)

    def instantiate(self, sourceLocation):
        if not self.fontSourcesDense:
            return None

        sourceLocation = makeDenseLocation(sourceLocation, self.defaultSourceLocation)
        locationTuple = locationToTuple(sourceLocation)

        sourceIdentifier = self.sourceIdsByLocation.get(locationTuple)
        if sourceIdentifier is not None:
            return self.fontSourcesDense[sourceIdentifier]

        sourceInstance = self._instanceCache.get(locationTuple)

        if sourceInstance is None:
            deltas = self.deltas
            result = self.model.interpolateFromDeltas(sourceLocation, deltas)
            if result.errors:
                logger.error(f"error while interpolating font sources {result.errors}")

            sourceInstance = result.instance.subject
            assert isinstance(sourceInstance, FontSource)
            self._instanceCache[locationTuple] = sourceInstance

        return sourceInstance


def areGuidelinesCompatible(parents):
    if not parents:
        return True  # or False, doesn't matter

    referenceGuidelines = parents[0].guidelines

    for parent in parents[1:]:
        if len(parent.guidelines) != len(referenceGuidelines):
            return False

        for guideline, reference in zip(parent.guidelines, referenceGuidelines):
            if guideline.name != reference.name:
                return False

    return True


@dataclass
class MathWrapper:
    subject: Any

    def __add__(self, other: MathWrapper) -> MathWrapper:
        return MathWrapper(add(self.subject, other.subject))

    def __sub__(self, other: MathWrapper) -> MathWrapper:
        return MathWrapper(subtract(self.subject, other.subject))

    def __mul__(self, scalar: MathWrapper) -> MathWrapper:
        return MathWrapper(multiply(self.subject, scalar))


@singledispatch
def add(v1, v2):
    return v1 + v2


@singledispatch
def subtract(v1, v2):
    return v1 - v2


@singledispatch
def multiply(v, scalar):
    return v * scalar


@add.register
def _(v1: StaticGlyph, v2):
    return _dataClassOperator(v1, v2, add)


@subtract.register
def _(v1: StaticGlyph, v2):
    return _dataClassOperator(v1, v2, subtract)


@multiply.register
def _(v: StaticGlyph, scalar):
    return _dataClassMul(v, scalar)


@add.register
def _(v1: DecomposedTransform, v2):
    return _dataClassOperator(v1, v2, add)


@subtract.register
def _(v1: DecomposedTransform, v2):
    return _dataClassOperator(v1, v2, subtract)


@multiply.register
def _(v: DecomposedTransform, scalar):
    return _dataClassMul(v, scalar)


@add.register
def _(v1: list, v2):
    return _listOperator(v1, v2, add)


@subtract.register
def _(v1: list, v2):
    return _listOperator(v1, v2, subtract)


@multiply.register
def _(v: list, scalar):
    return _listMul(v, scalar)


@add.register
def _(v1: dict, v2):
    return _dictOperator(v1, v2, add)


@subtract.register
def _(v1: dict, v2):
    return _dictOperator(v1, v2, subtract)


@multiply.register
def _(v: dict, scalar):
    return _dictMul(v, scalar)


@add.register
def _(v1: Component, v2):
    return _componentOperator(v1, v2, add)


@subtract.register
def _(v1: Component, v2):
    return _componentOperator(v1, v2, subtract)


@multiply.register
def _(v: Component, scalar):
    return _componentMul(v, scalar)


@add.register
def _(v1: Anchor, v2):
    return _anchorOperator(v1, v2, add)


@subtract.register
def _(v1: Anchor, v2):
    return _anchorOperator(v1, v2, subtract)


@multiply.register
def _(v: Anchor, scalar):
    return _anchorMul(v, scalar)


@add.register
def _(v1: None, v2):
    if v2 is not None:
        raise InterpolationError("incompatible value, None expected")
    return None


@subtract.register
def _(v1: None, v2):
    if v2 is not None:
        raise InterpolationError("incompatible value, None expected")
    return None


@multiply.register
def _(v: None, scalar):
    return None


@add.register
def _(v1: FontSource, v2):
    return _fontSourceOperator(v1, v2, add)


@subtract.register
def _(v1: FontSource, v2):
    return _fontSourceOperator(v1, v2, subtract)


@multiply.register
def _(v: FontSource, scalar):
    return _fontSourceMul(v, scalar)


def _fontSourceOperator(source1, source2, op):
    return FontSource(
        name="",
        location={},
        lineMetricsHorizontalLayout=op(
            source1.lineMetricsHorizontalLayout, source2.lineMetricsHorizontalLayout
        ),
        lineMetricsVerticalLayout=op(
            source1.lineMetricsVerticalLayout, source2.lineMetricsVerticalLayout
        ),
        italicAngle=op(source1.italicAngle, source2.italicAngle),
        guidelines=op(source1.guidelines, source2.guidelines),
    )


def _fontSourceMul(source, scalar):
    return FontSource(
        name=source.name,
        location={},
        lineMetricsHorizontalLayout=multiply(
            source.lineMetricsHorizontalLayout, scalar
        ),
        lineMetricsVerticalLayout=multiply(source.lineMetricsVerticalLayout, scalar),
        italicAngle=multiply(source.italicAngle, scalar),
        guidelines=multiply(source.guidelines, scalar),
    )


@add.register
def _(v1: LineMetric, v2):
    return _dataClassOperator(v1, v2, add)


@subtract.register
def _(v1: LineMetric, v2):
    return _dataClassOperator(v1, v2, subtract)


@multiply.register
def _(v: LineMetric, scalar):
    return _dataClassMul(v, scalar)


@add.register
def _(v1: Guideline, v2):
    return _dataClassOperator(v1, v2, add)


@subtract.register
def _(v1: Guideline, v2):
    return _dataClassOperator(v1, v2, subtract)


@multiply.register
def _(v: Guideline, scalar):
    return _dataClassMul(v, scalar)


def _dataClassOperator(v1, v2, op):
    return type(v1)(
        **{
            attrName: op(attrValue, getattr(v2, attrName))
            for attrName, attrValue in v1.__dict__.items()
        }
    )


def _dataClassMul(v1, scalar):
    return type(v1)(
        **{
            attrName: multiply(attrValue, scalar)
            for attrName, attrValue in v1.__dict__.items()
        }
    )


def _listOperator(v1, v2, op):
    return [op(i1, i2) for i1, i2 in zip(v1, v2, strict=True)]


def _listMul(v1, scalar):
    return [multiply(i1, scalar) for i1 in v1]


def _dictOperator(v1, v2, op):
    if v1.keys() != v2.keys():
        raise InterpolationError("incompatible component location")
    return {k: op(v, v2[k]) for k, v in v1.items()}


def _dictMul(location, scalar):
    return {k: multiply(v, scalar) for k, v in location.items()}


def _componentOperator(compo1, compo2, op):
    if compo1.name != compo2.name:
        raise InterpolationError("incompatible component name")
    return Component(
        name=compo1.name,
        transformation=op(compo1.transformation, compo2.transformation),
        location=_dictOperator(compo1.location, compo2.location, op),
    )


def _componentMul(compo, scalar):
    return Component(
        name=compo.name,
        transformation=multiply(compo.transformation, scalar),
        location=_dictMul(compo.location, scalar),
    )


def _anchorOperator(anchor1, anchor2, op):
    if anchor1.name != anchor2.name:
        raise InterpolationError("incompatible anchor name")
    return replace(anchor1, x=op(anchor1.x, anchor2.x), y=op(anchor1.y, anchor2.y))


def _anchorMul(anchor, scalar):
    return replace(anchor, x=anchor.x * scalar, y=anchor.y * scalar)


def mapLocationFromUserToSource(location, fontAxes):
    return location | {
        axis.name: mapValueFromUserToSource(
            location.get(axis.name, axis.defaultValue), axis
        )
        for axis in fontAxes
    }


def mapValueFromUserToSource(value, axis):
    if not axis.mapping:
        return value
    return piecewiseLinearMap(value, dict(axis.mapping))
