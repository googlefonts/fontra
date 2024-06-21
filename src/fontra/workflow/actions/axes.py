from __future__ import annotations

import logging
from copy import deepcopy
from dataclasses import dataclass, field, replace
from functools import partial
from typing import Any

from fontTools.varLib.models import piecewiseLinearMap

from ...core.async_property import async_cached_property
from ...core.classes import (
    Axes,
    DiscreteFontAxis,
    FontAxis,
    GlyphSource,
    Layer,
    VariableGlyph,
    structure,
    unstructure,
)
from . import ActionError
from .base import (
    BaseFilter,
    filterLocation,
    getActiveSources,
    locationToString,
    registerFilterAction,
    tuplifyLocation,
)

logger = logging.getLogger(__name__)


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
        mapFunc = partial(_renameLocationAxes, axisRenameMap=self.axisRenameMap)
        return mapGlyphSourceLocationsAndFilter(glyph, mapFunc)

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
        mapFunc = partial(mapLocation, mapFuncs=await self.axisValueMapFunctions)
        return mapGlyphSourceLocationsAndFilter(glyph, mapFunc)

    async def getAxes(self) -> Axes:
        axes = await self.inputAxes
        mapFuncs = await self.axisValueMapFunctions
        return replace(
            axes, axes=[_dropAxisMapping(axis, mapFuncs) for axis in axes.axes]
        )


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
        mapFunc = partial(mapLocation, mapFuncs=await self.axisValueMapFunctions)
        return mapGlyphSourceLocationsAndFilter(glyph, mapFunc)


@registerFilterAction("subset-axes")
@dataclass(kw_only=True)
class SubsetAxes(BaseFilter):
    axisNames: set[str] = field(default_factory=set)
    dropAxisNames: set[str] = field(default_factory=set)

    def __post_init__(self):
        self.axisNames = set(self.axisNames)
        self.dropAxisNames = set(self.dropAxisNames)

    def getAxisNamesToKeep(self, axes: list[FontAxis | DiscreteFontAxis]) -> set[str]:
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

        def mapFilterFunc(location):
            if (
                subsetLocationKeep(locationToKeep | location, locationToKeep)
                != locationToKeep
            ):
                return None

            return subsetLocationDrop(location, locationToKeep)

        return mapGlyphSourceLocationsAndFilter(glyph, mapFilterFunc)


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


class BaseMoveDefaultLocation(BaseFilter):
    @async_cached_property
    async def newDefaultSourceLocation(self):
        newDefaultUserLocation = self._getDefaultUserLocation()
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
        return replace(
            axes,
            axes=self._filterAxisList(axes.axes),
        )

    async def getGlyph(self, glyphName: str) -> VariableGlyph:
        instancer = await self.fontInstancer.getGlyphInstancer(glyphName)

        originalDefaultSourceLocation = instancer.defaultSourceLocation
        newDefaultSourceLocation = await self.newDefaultSourceLocation

        locations = [
            originalDefaultSourceLocation | source.location
            for source in instancer.activeSources
        ]

        allAxisNames = {axis.name for axis in instancer.combinedAxes}

        newLocations = moveDefaultLocations(
            locations,
            originalDefaultSourceLocation,
            newDefaultSourceLocation,
            allAxisNames,
        )

        return updateSourcesAndLayers(
            instancer,
            self._filterNewLocations(newLocations, await self.newDefaultSourceLocation),
        )

    def _filterAxisList(self, axes):
        raise NotImplementedError()

    def _getDefaultUserLocation(self):
        raise NotImplementedError()

    async def _filterNewLocations(self, newLocations, location):
        raise NotImplementedError()


def moveDefaultLocations(
    originalLocations,
    originalDefaultSourceLocation,
    newDefaultSourceLocation,
    allAxisNames,
):
    movingAxisNames = set(newDefaultSourceLocation)
    interactingAxisNames = set()

    for location in originalLocations:
        contributingAxes = set()
        for axisName, value in location.items():
            if value != originalDefaultSourceLocation[axisName]:
                contributingAxes.add(axisName)
        if len(contributingAxes) > 1 and not contributingAxes.isdisjoint(
            movingAxisNames
        ):
            interactingAxisNames.update(contributingAxes)

    standaloneAxes = allAxisNames - interactingAxisNames

    newLocations = deepcopy(originalLocations)

    currentDefaultLocation = dict(originalDefaultSourceLocation)

    for movingAxisName, movingAxisValue in newDefaultSourceLocation.items():
        newDefaultAxisLoc = {movingAxisName: movingAxisValue}

        locationsToAdd = [
            loc | newDefaultAxisLoc
            for loc in newLocations
            if any(
                loc[axisName] != currentDefaultLocation[axisName]
                for axisName in interactingAxisNames
            )
        ]

        for axisName in standaloneAxes:
            if axisName == movingAxisName:
                continue

            for loc in newLocations:
                if (
                    loc[axisName] != currentDefaultLocation[axisName]
                    and loc[movingAxisName] == currentDefaultLocation[movingAxisName]
                ):
                    loc[movingAxisName] = movingAxisValue

        currentDefaultLocation = currentDefaultLocation | newDefaultAxisLoc

        locationsToAdd.append(dict(currentDefaultLocation))
        for loc in locationsToAdd:
            if loc not in newLocations:
                newLocations.append(loc)

    return newLocations


@registerFilterAction("move-default-location")
@dataclass(kw_only=True)
class MoveDefaultLocation(BaseMoveDefaultLocation):
    newDefaultUserLocation: dict[str, float]

    def _getDefaultUserLocation(self):
        return self.newDefaultUserLocation

    def _filterAxisList(self, axes):
        newDefaultUserLocation = self._getDefaultUserLocation()
        return [
            replace(
                axis,
                defaultValue=newDefaultUserLocation.get(axis.name, axis.defaultValue),
            )
            for axis in axes
        ]

    def _filterNewLocations(self, newLocations, location):
        return newLocations


@registerFilterAction("instantiate")
@dataclass(kw_only=True)
class Instantiate(BaseMoveDefaultLocation):
    location: dict[str, float]

    def _getDefaultUserLocation(self):
        return self.location

    def _filterAxisList(self, axes):
        location = self._getDefaultUserLocation()
        return [axis for axis in axes if axis.name not in location]

    def _filterNewLocations(self, newLocations, location):
        filteredLocations = [
            loc
            for loc in newLocations
            if all(loc.get(name, value) == value for name, value in location.items())
        ]
        return filteredLocations


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

        originalLocations = [
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

        newLocations = trimLocations(originalLocations, ranges)

        return updateSourcesAndLayers(instancer, newLocations)


def trimLocations(originalLocations, ranges):
    return [trimLocation(loc, ranges) for loc in originalLocations]


def trimLocation(originalLocation, ranges):
    newLocation = {**originalLocation}

    for axisName, value in originalLocation.items():
        if axisName not in ranges:
            continue
        minValue, maxValue = ranges[axisName]
        newLocation[axisName] = max(min(value, maxValue), minValue)

    return newLocation


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


def mapGlyphSourceLocationsAndFilter(glyph, mapFilterFunc):
    newSources = []
    layersToDelete = set()
    for source in glyph.sources:
        newLocation = mapFilterFunc(source.location)
        if newLocation is None:
            layersToDelete.add(source.layerName)
        else:
            newSources.append(replace(source, location=newLocation))
    layersToKeep = {source.layerName for source in newSources}
    layersToDelete -= layersToKeep
    newLayers = {
        layerName: layer
        for layerName, layer in glyph.layers.items()
        if layerName not in layersToDelete
    }
    return replace(glyph, sources=newSources, layers=newLayers)


def mapLocation(location, mapFuncs):
    return {
        axisName: mapFuncs.get(axisName, lambda x: x)(axisValue)
        for axisName, axisValue in location.items()
    }
