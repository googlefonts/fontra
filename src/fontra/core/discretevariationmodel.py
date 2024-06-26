from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from fontTools.varLib.models import (
    VariationModel,
    VariationModelError,
    normalizeLocation,
)

from .classes import DiscreteFontAxis, FontAxis
from .varutils import locationToTuple, makeSparseNormalizedLocation


class DiscreteVariationModel:
    def __init__(
        self,
        locations: list[dict[str, float]],
        fontAxesSourceSpace: list[FontAxis | DiscreteFontAxis],
    ):
        assert not any(axis.mapping for axis in fontAxesSourceSpace)

        self._discreteAxes = [
            axis for axis in fontAxesSourceSpace if not isinstance(axis, FontAxis)
        ]
        self._continuousAxes = [
            axis for axis in fontAxesSourceSpace if isinstance(axis, FontAxis)
        ]
        self._continuousAxesTriples = {
            axis.name: (axis.minValue, axis.defaultValue, axis.maxValue)
            for axis in self._continuousAxes
        }

        self._locations = {}
        self._locationsKeyToDiscreteLocation = {}
        self._locationKeys = []
        self._locationIndices = {}

        for index, location in enumerate(locations):
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

        self._models = {}

    def getDeltas(self, sourceValues) -> DiscreteDeltas:
        sources = defaultdict(list)
        for key, value in zip(self._locationKeys, sourceValues, strict=True):
            sources[key].append(value)

        return DiscreteDeltas(sources=dict(sources), deltas={})

    def _getModel(self, key):
        cachedModelInfo = self._models.get(key)
        if cachedModelInfo is None:
            usedKey = key
            errors = []
            locations = self._locations.get(key)
            if locations is None:
                raise NotImplementedError
                # const nearestKey = self._findNearestDiscreteLocationKey(key);
                # const { model: substModel } = self._getModel(nearestKey);
                # model = substModel;
                # errors = [
                #   {
                #     message: `there are no sources for ${formatDiscreteLocationKey(key)}`,
                #     xxx type: "model-warning",
                #   },
                # ];
                # usedKey = nearestKey;
            else:
                try:
                    model = VariationModel(locations)
                except VariationModelError as exc:
                    niceKey = f"{formatDiscreteLocationKey(key)}: " if key else ""
                    errors.append(
                        ErrorDescription(message=f"{niceKey}{exc}", type="model-error")
                    )
                    model = BrokenVariationModel(locations)

            cachedModelInfo = (model, usedKey, errors if errors else None)
            self._models[key] = cachedModelInfo

        return cachedModelInfo

    # _findNearestDiscreteLocationKey(key) {
    #   const targetLocation = JSON.parse(key);
    #   const locationKeys = Object.keys(self._locationsKeyToDiscreteLocation);
    #   const locations = Object.values(self._locationsKeyToDiscreteLocation);
    #   const nearestIndex = findNearestLocationIndex(JSON.parse(key), locations);
    #   return locationKeys[nearestIndex];
    # }

    def interpolateFromDeltas(self, location, deltas) -> InterpolationResult:
        discreteLocation, contiuousLocation = self.splitDiscreteLocation(location)
        key = locationToTuple(discreteLocation)
        model, usedKey, errors = self._getModel(key)

        if key not in deltas.deltas:
            try:
                deltas.deltas[key] = model.getDeltas(deltas.sources[usedKey])
            except Exception as exc:  # ??? Which exception really
                if errors is None:
                    errors = []
                errors.append(
                    ErrorDescription(message=str(exc), type="interpolation-error")
                )
                model = BrokenVariationModel(self._locations[key])
                deltas.deltas[key] = model.getDeltas(deltas.sources[usedKey])
                cachedModelInfo = (model, usedKey, errors)
                self._models[key] = cachedModelInfo

        instance = model.interpolateFromDeltas(
            normalizeLocation(contiuousLocation, self._continuousAxesTriples),
            deltas.deltas[key],
        )
        return InterpolationResult(instance=instance, errors=errors)

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


@dataclass(kw_only=True)
class InterpolationResult:
    instance: Any
    errors: list | None


@dataclass(kw_only=True)
class ErrorDescription:
    message: str
    type: str
