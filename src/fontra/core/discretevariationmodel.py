from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from fontTools.varLib.models import (
    VariationModel,
    VariationModelError,
    normalizeLocation,
)

from .classes import DiscreteFontAxis, FontAxis, GlyphAxis
from .varutils import locationToTuple, makeSparseNormalizedLocation

CachedModelInfoType = tuple[VariationModel, tuple, list | None]
LocationTupleType = tuple[tuple[str, float], ...]


@dataclass
class DiscreteVariationModel:
    locations: list[dict[str, float]]
    axes: list[FontAxis | DiscreteFontAxis | GlyphAxis]
    softFail: bool = True  # When False, exceptions are raised on interpolation errors

    def __post_init__(self) -> None:
        assert not any(axis.mapping for axis in self.axes if hasattr(axis, "mapping"))

        self._discreteAxes = [axis for axis in self.axes if hasattr(axis, "values")]
        self._continuousAxes = [
            axis for axis in self.axes if not hasattr(axis, "values")
        ]
        self._continuousAxesTriples = {
            axis.name: (axis.minValue, axis.defaultValue, axis.maxValue)
            for axis in self._continuousAxes
        }

        self._locations: dict[LocationTupleType, list[dict]] = {}
        self._locationsKeyToDiscreteLocation = {}
        self._locationKeys = []
        self._locationIndices: dict[LocationTupleType, list[int]] = {}

        for index, location in enumerate(self.locations):
            discreteLocation, contiuousLocation = self.splitDiscreteLocation(location)
            key = locationToTuple(discreteLocation)
            self._locationKeys.append(key)
            if key not in self._locationIndices:
                self._locationIndices[key] = [index]
            else:
                self._locationIndices[key].append(index)
            normalizedLocation = makeSparseNormalizedLocation(
                normalizeLocation(contiuousLocation, self._continuousAxesTriples)
            )
            if key not in self._locations:
                self._locations[key] = [normalizedLocation]
                self._locationsKeyToDiscreteLocation[key] = discreteLocation
            else:
                self._locations[key].append(normalizedLocation)

        self._models: dict[LocationTupleType, CachedModelInfoType] = {}

    def getDeltas(self, sourceValues) -> DiscreteDeltas:
        sources = defaultdict(list)
        for key, value in zip(self._locationKeys, sourceValues, strict=True):
            sources[key].append(value)

        return DiscreteDeltas(sources=dict(sources), deltas={}, models={})

    def _getModel(self, key: LocationTupleType) -> CachedModelInfoType:
        cachedModelInfo = self._models.get(key)
        if cachedModelInfo is None:
            usedKey = key
            errors = []
            locations = self._locations.get(key)
            if locations is None:
                nearestKey = self._findNearestDiscreteLocationKey(key)
                model, _, _ = self._getModel(nearestKey)
                errors = [
                    ErrorDescription(
                        message=f"there are no sources for {formatDiscreteLocationKey(key)}",
                        type="model-warning",
                    ),
                ]
                usedKey = nearestKey
            else:
                try:
                    model = VariationModel(locations)
                except VariationModelError as exc:
                    if not self.softFail:
                        raise
                    niceKey = f"{formatDiscreteLocationKey(key)}: " if key else ""
                    errors.append(
                        ErrorDescription(message=f"{niceKey}{exc}", type="model-error")
                    )
                    model = BrokenVariationModel(locations)

            cachedModelInfo = (model, usedKey, errors if errors else None)
            self._models[key] = cachedModelInfo

        return cachedModelInfo

    def _findNearestDiscreteLocationKey(self, key):
        locationKeys = list(self._locationsKeyToDiscreteLocation.keys())
        locations = list(self._locationsKeyToDiscreteLocation.values())
        nearestIndex = findNearestLocationIndex(dict(key), locations)
        return locationKeys[nearestIndex]

    def checkCompatibilityFromDeltas(self, deltas):
        # If self.softFail is False, this will raise an exception when there's
        # an incompatibilty instead of returning a list of errors
        collectedErrors = []
        for key in self._locationsKeyToDiscreteLocation.keys():
            _, _, errors = self._getDiscreteDeltasAndModel(key, deltas)
            if errors is not None:
                collectedErrors.extend(errors)
        return collectedErrors

    def interpolateFromDeltas(self, location, deltas) -> InterpolationResult:
        discreteLocation, contiuousLocation = self.splitDiscreteLocation(location)
        key = locationToTuple(discreteLocation)

        discreteDeltas, model, errors = self._getDiscreteDeltasAndModel(key, deltas)

        instance = model.interpolateFromDeltas(
            normalizeLocation(contiuousLocation, self._continuousAxesTriples),
            discreteDeltas,
        )
        return InterpolationResult(instance=instance, errors=errors)

    def _getDiscreteDeltasAndModel(self, key, deltas):
        model, usedKey, errors = self._getModel(key)

        if key not in deltas.deltas:
            sourceValues = deltas.sources[usedKey]
            if None in sourceValues:
                model, sourceValues = model.getSubModel(sourceValues)

            try:
                deltas.deltas[key] = model.getDeltas(sourceValues)
            except Exception as exc:  # ??? Which exception really
                if not self.softFail:
                    raise
                if errors is None:
                    errors = []
                errors.append(
                    ErrorDescription(message=str(exc), type="interpolation-error")
                )
                model = BrokenVariationModel(self._locations[key])
                deltas.deltas[key] = model.getDeltas(deltas.sources[usedKey])
                cachedModelInfo = (model, usedKey, errors)
                self._models[key] = cachedModelInfo

            deltas.models[key] = model

        return deltas.deltas[key], deltas.models[key], errors

    def splitDiscreteLocation(self, location):
        discreteLocation = {}
        location = {**location}
        for axis in self._discreteAxes:
            value = location.get(axis.name)
            if value is not None:
                del location[axis.name]
                if value not in axis.values:
                    # Ensure the value is actually in the values list
                    value = findNearestValue(value, axis.values)
            else:
                value = axis.defaultValue
            discreteLocation[axis.name] = value
        return (discreteLocation, location)


class BrokenVariationModel:
    def __init__(self, locations):
        self.locations = locations

    def getDeltas(self, sourceValues):
        return sourceValues

    def interpolateFromDeltas(self, location, deltas):
        index = findNearestLocationIndex(location, self.locations)
        return deltas[index]


def findNearestValue(value, values):
    if not values:
        return value
    values = sorted(values, key=lambda v: abs(v - value))
    return values[0]


def findNearestLocationIndex(targetLocation, locations):
    # Return the index of the location in `locations` that is nearest to
    # `targetLocation`.
    # If `locations` are sparse, they must be normalized.
    # `targetLocation` must *not* be sparse.
    closestIndex = None
    smallestDistanceSquared = None
    for index, loc in enumerate(locations):
        distanceSquared = 0
        for axisName, value in targetLocation.items():
            otherValue = loc.get(axisName, 0)
            distanceSquared += (value - otherValue) ** 2

        if closestIndex is None or distanceSquared < smallestDistanceSquared:
            closestIndex = index
            smallestDistanceSquared = distanceSquared

    return closestIndex


def formatDiscreteLocationKey(key):
    return ",".join(f"{axisName}={value}" for axisName, value in key)


@dataclass(kw_only=True)
class DiscreteDeltas:
    sources: dict
    deltas: dict
    models: dict


@dataclass(kw_only=True)
class InterpolationResult:
    instance: Any
    errors: list | None


@dataclass(kw_only=True)
class ErrorDescription:
    message: str
    type: str
