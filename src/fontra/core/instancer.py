from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from functools import cached_property, partial, singledispatch
from typing import Any

from fontTools.misc.transform import DecomposedTransform
from fontTools.varLib.models import (
    VariationModel,
    normalizeLocation,
    piecewiseLinearMap,
)

from .classes import Component, GlobalAxis, LocalAxis, StaticGlyph, VariableGlyph


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
            glyphInstancer = GlyphInstancer(glyph, self.globalAxes)
            if addToCache:
                self.glyphInstancers[glyphName] = glyphInstancer
        return glyphInstancer


@dataclass
class GlyphInstancer:
    glyph: VariableGlyph
    globalAxes: list[GlobalAxis]

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
    def model(self):
        locations = [
            normalizeLocation(source.location, self.combinedAxisTuples)
            for source in self.activeSources
        ]
        # TODO: axis order, see also glyph-controller.js
        return VariationModel(locations)

    @cached_property
    def deltas(self):
        layers = self.glyph.layers
        sourceValues = [
            MathWrapper(layers[source.layerName].glyph) for source in self.activeSources
        ]
        return self.model.getDeltas(sourceValues)

    def instantiate(self, location, coordSystem=LocationCoordinateSystem.SOURCE):
        if coordSystem == LocationCoordinateSystem.USER:
            location = {
                **location,
                **mapLocationFromUserToSource(location, self.globalAxes),
            }

        if coordSystem != LocationCoordinateSystem.NORMALIZED:
            location = normalizeLocation(location, self.combinedAxisTuples)

        result = self.model.interpolateFromDeltas(location, self.deltas)
        assert isinstance(result, MathWrapper)
        return result.subject


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


@add.register
def _(v1: str, v2):
    if v1 != v2:
        raise InterpolationError("incompatible string, same value expected")
    return v1


@subtract.register
def _(v1: str, v2):
    if v1 != v2:
        raise InterpolationError("incompatible string, same value expected")
    return v1


@multiply.register
def _(v: str, scalar):
    return v


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


def mapLocationFromUserToSource(location, axes):
    return {
        axis.name: mapValueFromUserToSource(
            location.get(axis.name, axis.defaultValue), axis
        )
        for axis in axes
    }


def mapValueFromUserToSource(value, axis):
    if not axis.mapping:
        return value
    return piecewiseLinearMap(value, dict(axis.mapping))


def makeAxisMapFunc(axis):
    if not axis.mapping:
        return lambda value: value
    return partial(piecewiseLinearMap, mapping=dict(axis.mapping))
