from __future__ import annotations

from dataclasses import dataclass, replace
from enum import Enum
from functools import cached_property, partial, singledispatch
from typing import Any

from fontTools.misc.transform import DecomposedTransform
from fontTools.varLib.models import (
    VariationModel,
    normalizeLocation,
    piecewiseLinearMap,
)

from .classes import Component, GlobalAxis, Layer, LocalAxis, StaticGlyph, VariableGlyph


class InterpolationError(Exception):
    pass


class LocationCoordinateSystem(Enum):
    USER = 1
    SOURCE = 2  # "designspace coords"
    NORMALIZED = 3


@dataclass
class FontInstancer:
    backend: Any

    def __post_init__(self):
        self.glyphInstancers = {}
        self.globalAxes = None

    async def getGlyphInstancer(self, glyphName, addToCache=False):
        glyphInstancer = self.glyphInstancers.get(glyphName)
        if glyphInstancer is None:
            if self.globalAxes is None:
                self.globalAxes = await self.backend.getGlobalAxes()
            glyph = await self.backend.getGlyph(glyphName)
            glyph = await self._ensureComponentLocationCompatibility(glyph)
            glyphInstancer = GlyphInstancer(glyph, self.globalAxes)
            if addToCache:
                self.glyphInstancers[glyphName] = glyphInstancer
        return glyphInstancer

    async def _ensureComponentLocationCompatibility(self, glyph):
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
            raise InterpolationError("components are not interpolatable")

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


def _areComponentLocationsCompatible(glyphs):
    ok = True
    numComponents = None
    componentAxisNames = None

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

    return ok, componentAxisNames


def _fixComponentLocationsCompatibility(
    glyph, layerGlyphs, componentAxisNames, axisDefaults
):
    return replace(
        glyph,
        layers={
            layerName: Layer(
                glyph=replace(
                    layerGlyph,
                    components=[
                        _fixComponentLocation(compo, axisNames, axisDefaults)
                        for compo, axisNames in zip(
                            layerGlyph.components, componentAxisNames, strict=True
                        )
                    ],
                )
            )
            for layerName, layerGlyph in layerGlyphs.items()
        },
    )


def _fixComponentLocation(component, axisNames, axisDefaults):
    return replace(
        component,
        location={
            axisName: component.location.get(axisName, axisDefaults.get(axisName, 0))
            for axisName in axisNames
        },
    )


@dataclass
class GlyphInstancer:
    glyph: VariableGlyph
    globalAxes: list[GlobalAxis]

    def instantiate(self, location, *, coordSystem=LocationCoordinateSystem.SOURCE):
        if coordSystem == LocationCoordinateSystem.USER:
            location = mapLocationFromUserToSource(location, self.globalAxes)

        if coordSystem != LocationCoordinateSystem.NORMALIZED:
            location = normalizeLocation(location, self.combinedAxisTuples)

        result = self.model.interpolateFromDeltas(location, self.deltas)
        assert isinstance(result, MathWrapper)
        return result.subject

    @cached_property
    def combinedAxes(self):
        combinedAxes = list(self.glyph.axes)
        localAxisNames = {axis.name for axis in self.glyph.axes}
        for axis in self.globalAxes:
            if axis.name in localAxisNames:
                continue
            mapFunc = makeAxisMapFunc(axis)
            axis = LocalAxis(
                axis.name,
                minValue=mapFunc(axis.minValue),
                defaultValue=mapFunc(axis.defaultValue),
                maxValue=mapFunc(axis.maxValue),
            )
            combinedAxes.append(axis)
        return combinedAxes

    @cached_property
    def combinedAxisTuples(self):
        return {
            axis.name: (axis.minValue, axis.defaultValue, axis.maxValue)
            for axis in self.combinedAxes
        }

    @cached_property
    def activeSources(self):
        return [source for source in self.glyph.sources if not source.inactive]

    @cached_property
    def activeLayerGlyphs(self):
        layers = self.glyph.layers
        return [layers[source.layerName].glyph for source in self.activeSources]

    @cached_property
    def model(self):
        locations = [
            normalizeLocation(source.location, self.combinedAxisTuples)
            for source in self.activeSources
        ]
        # TODO: axis order, see also glyph-controller.js
        return VariationModel(locations)

    @cached_property
    def deltas(self):
        sourceValues = [
            MathWrapper(layerGlyph) for layerGlyph in self.activeLayerGlyphs
        ]
        return self.model.getDeltas(sourceValues)


@dataclass
class MathWrapper:
    subject: Any

    def __add__(self, other):
        return MathWrapper(add(self.subject, other.subject))

    def __sub__(self, other):
        return MathWrapper(subtract(self.subject, other.subject))

    def __mul__(self, scalar):
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
def _(v1: Component, v2):
    return _componentOperator(v1, v2, add)


@subtract.register
def _(v1: Component, v2):
    return _componentOperator(v1, v2, subtract)


@multiply.register
def _(v: Component, scalar):
    return _componentMul(v, scalar)


def _componentOperator(compo1, compo2, op):
    if compo1.name != compo2.name:
        raise InterpolationError("incompatible component name")
    return Component(
        name=compo1.name,
        transformation=op(compo1.transformation, compo2.transformation),
        location=_locationOperator(compo1.location, compo2.location, op),
    )


def _componentMul(compo, scalar):
    return Component(
        name=compo.name,
        transformation=multiply(compo.transformation, scalar),
        location=_locationMul(compo.location, scalar),
    )


def _locationOperator(v1, v2, op):
    if v1.keys() != v2.keys():
        raise InterpolationError("incompatible component location")
    return {k: op(v, v2[k]) for k, v in v1.items()}


def _locationMul(location, scalar):
    return {k: v * scalar for k, v in location.items()}


@add.register
def _(v1: type(None), v2):
    if v2 is not None:
        raise InterpolationError("incompatible value, None expected")
    return None


@subtract.register
def _(v1: type(None), v2):
    if v2 is not None:
        raise InterpolationError("incompatible value, None expected")
    return None


@multiply.register
def _(v: type(None), scalar):
    return None


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
    return [op(i1, i2) for i1, i2 in zip(v1, v2)]


def _listMul(v1, scalar):
    return [multiply(i1, scalar) for i1 in v1]


def mapLocationFromUserToSource(location, globalAxes):
    return location | {
        axis.name: mapValueFromUserToSource(
            location.get(axis.name, axis.defaultValue), axis
        )
        for axis in globalAxes
    }


def mapValueFromUserToSource(value, axis):
    if not axis.mapping:
        return value
    return piecewiseLinearMap(value, dict(axis.mapping))


def makeAxisMapFunc(axis):
    if not axis.mapping:
        return lambda value: value
    return partial(piecewiseLinearMap, mapping=dict(axis.mapping))
