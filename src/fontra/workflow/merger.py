from __future__ import annotations

import logging
from collections import defaultdict
from copy import deepcopy
from dataclasses import dataclass, replace
from typing import Any

from ..core.async_property import async_cached_property
from ..core.classes import (
    Axes,
    FontInfo,
    FontSource,
    Kerning,
    OpenTypeFeatures,
    VariableGlyph,
    unstructure,
)
from ..core.protocols import ReadableFontBackend
from ..core.varutils import locationToTuple
from .actions.axes import mapFontSourceLocationsAndFilter
from .actions.subset import subsetKerning
from .features import mergeFeatures

logger = logging.getLogger(__name__)


@dataclass(kw_only=True)
class FontBackendMerger:
    inputA: ReadableFontBackend
    inputB: ReadableFontBackend

    def __post_init__(self):
        self._glyphNamesA = None
        self._glyphNamesB = None
        self._glyphMap = None

    async def aclose(self) -> None:
        pass

    async def _prepareGlyphMap(self):
        if self._glyphMap is not None:
            return
        self._glyphMapA = await self.inputA.getGlyphMap()
        self._glyphMapB = await self.inputB.getGlyphMap()
        cmapA = cmapFromGlyphMap(self._glyphMapA)
        cmapB = cmapFromGlyphMap(self._glyphMapB)

        cmap = cmapA | cmapB
        encodedGlyphMap = defaultdict(set)
        for codePoint, glyphName in cmap.items():
            encodedGlyphMap[glyphName].add(codePoint)

        self._glyphMap = {
            glyphName: sorted(encodedGlyphMap.get(glyphName, []))
            for glyphName in self._glyphMapA | self._glyphMapB
        }

        self._glyphNamesB = set(self._glyphMapB)
        self._glyphNamesA = set(self._glyphMapA)

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        await self._prepareGlyphMap()
        if glyphName in self._glyphNamesB:
            if glyphName in self._glyphNamesA:
                logger.warning(f"Merger: Glyph {glyphName!r} exists in both fonts")
            return await self.inputB.getGlyph(glyphName)
        elif glyphName in self._glyphNamesA:
            return await self.inputA.getGlyph(glyphName)
        return None

    async def getFontInfo(self) -> FontInfo:
        fontInfoA = await self.inputA.getFontInfo()
        fontInfoB = await self.inputB.getFontInfo()
        return FontInfo(**(unstructure(fontInfoA) | unstructure(fontInfoB)))

    @async_cached_property
    async def mergedAxes(self) -> Axes:
        axesA = await self.inputA.getAxes()
        axesB = await self.inputB.getAxes()
        axesByNameA = {axis.name: axis for axis in axesA.axes}
        axisNamesB = {axis.name for axis in axesB.axes}
        mergedAxes = []
        for axis in axesB.axes:
            if axis.name in axesByNameA:
                axis = _mergeAxes(axesByNameA[axis.name], axis)
            mergedAxes.append(axis)

        for axis in axesA.axes:
            if axis.name not in axisNamesB:
                mergedAxes.append(axis)

        return replace(axesA, axes=mergedAxes)

    async def getAxes(self) -> Axes:
        return await self.mergedAxes

    @async_cached_property
    async def mergedSourcesInfo(self) -> MergedSourcesInfo:
        mergedAxes = await self.mergedAxes
        defaultLocation = {axis.name: axis.defaultValue for axis in mergedAxes.axes}

        def mapLocation(location):
            return defaultLocation | location

        sourcesA = mapFontSourceLocationsAndFilter(
            await self.inputA.getSources(), mapLocation
        )
        sourcesB = mapFontSourceLocationsAndFilter(
            await self.inputB.getSources(), mapLocation
        )

        sourcesAByLocation = sourcesByLocation(sourcesA)
        sourcesBByLocation = sourcesByLocation(sourcesB)
        allLocations = sorted(set(sourcesAByLocation) | set(sourcesBByLocation))

        mergedSources = {}
        identifierMappingA = {}
        for location in allLocations:
            idA, sourceA = sourcesAByLocation.get(location, (None, None))
            idB, sourceB = sourcesBByLocation.get(location, (None, None))
            if idA is None:
                mergedSources[idB] = sourceB
            elif idB is None:
                mergedSources[idA] = sourceA
            else:
                identifierMappingA[idA] = idB
                mergedSources[idB] = replace(
                    sourceB,
                    lineMetricsHorizontalLayout=sourceA.lineMetricsHorizontalLayout
                    | sourceB.lineMetricsHorizontalLayout,
                    lineMetricsVerticalLayout=sourceA.lineMetricsVerticalLayout
                    | sourceB.lineMetricsVerticalLayout,
                    customData=sourceA.customData | sourceB.customData,
                )

        return MergedSourcesInfo(
            sources=mergedSources, identifierMappingA=identifierMappingA
        )

    async def getSources(self) -> dict[str, FontSource]:
        mergeInfo = await self.mergedSourcesInfo
        return mergeInfo.sources

    async def getGlyphMap(self) -> dict[str, list[int]]:
        await self._prepareGlyphMap()
        return self._glyphMap

    async def getKerning(self) -> dict[str, Kerning]:
        await self._prepareGlyphMap()
        mergeInfo = await self.mergedSourcesInfo

        kerningA = subsetKerning(
            await self.inputA.getKerning(), self._glyphNamesA - self._glyphNamesB
        )
        kerningB = subsetKerning(await self.inputB.getKerning(), self._glyphNamesB)

        newKerning = {}
        for kernType in sorted(set(kerningA) | set(kerningB)):
            kernTableA = kerningA.get(kernType)
            kernTableB = kerningB.get(kernType)

            if kernTableA is not None:
                kernTableA = replace(
                    kernTableA,
                    sourceIdentifiers=[
                        mergeInfo.identifierMappingA.get(sid, sid)
                        for sid in kernTableA.sourceIdentifiers
                    ],
                )

            if kernTableA is None:
                newKernTable = kernTableB
            elif kernTableB is None:
                newKernTable = kernTableA
            else:
                newKernTable = _mergeKernTable(kernTableA, kernTableB)

            newKerning[kernType] = newKernTable
        return newKerning

    async def getFeatures(self) -> OpenTypeFeatures:
        await self._prepareGlyphMap()
        featuresA = await self.inputA.getFeatures()
        featuresB = await self.inputB.getFeatures()
        if featuresA.language != "fea" or featuresB.language != "fea":
            logger.warning("can't merge languages other than fea")
            return featuresB

        if not featuresA.text:
            return featuresB
        elif not featuresB.text:
            return featuresA

        mergedFeatureText, mergedGlyphMap = mergeFeatures(
            featuresA.text, self._glyphMapA, featuresB.text, self._glyphMapB
        )

        assert set(mergedGlyphMap) == set(self._glyphMap)

        return OpenTypeFeatures(text=mergedFeatureText)

    async def getCustomData(self) -> dict[str, Any]:
        customDataA = await self.inputA.getCustomData()
        customDataB = await self.inputB.getCustomData()
        return customDataA | customDataB

    async def getUnitsPerEm(self) -> int:
        unitsPerEmA = await self.inputA.getUnitsPerEm()
        unitsPerEmB = await self.inputB.getUnitsPerEm()
        if unitsPerEmA != unitsPerEmB:
            logger.warning(
                f"Merger: Fonts have different units-per-em; A: {unitsPerEmA}, B: {unitsPerEmB}"
            )
        return unitsPerEmB


@dataclass(kw_only=True)
class MergedSourcesInfo:
    sources: dict[str, FontSource]
    identifierMappingA: dict[str, str]


def sourcesByLocation(sources):
    return {
        locationToTuple(source.location): (sourceIdentifier, source)
        for sourceIdentifier, source in sources.items()
    }


def cmapFromGlyphMap(glyphMap):
    cmap = {}
    for glyphName, codePoints in sorted(glyphMap.items()):
        for codePoint in codePoints:
            if codePoint in cmap:
                logger.warning(
                    f"Merger: Code point U+{codePoint:04X} is mapped multiple times: "
                    f"{cmap[codePoint]}, {glyphName}"
                )
            else:
                cmap[codePoint] = glyphName
    return cmap


def _mergeAxes(axisA, axisB):
    # TODO: merge axis labels and axis value labels
    resultAxis = deepcopy(axisB)

    if axisA.mapping != axisB.mapping:
        logger.error(
            "Merger: Axis mappings should be the same; "
            f"{axisA.name}, A: {axisA.mapping}, B: {axisB.mapping}"
        )

    if axisA.defaultValue != axisB.defaultValue:
        logger.error(
            "Merger: Axis default values should be the same; "
            f"{axisA.name}, A: {axisA.defaultValue}, B: {axisB.defaultValue}"
        )

    if hasattr(axisA, "values") != hasattr(axisB, "values"):
        logger.error(
            f"Merger: Can't merge continuous axis with discrete axis: {axisA.name}"
        )
    elif hasattr(axisA, "values"):
        resultAxis.values = sorted(set(axisA.values) | set(axisB.values))
    else:
        resultAxis.maxValue = max(axisA.maxValue, axisB.maxValue)
        resultAxis.minValue = min(axisA.minValue, axisB.minValue)

    return resultAxis


def _mergeKernTable(kernTableA, kernTableB):
    if not set(kernTableA.groups).isdisjoint(set(kernTableB.groups)):
        kernTableA = _disambiguateKerningGroupNames(kernTableA, kernTableB)

    assert set(kernTableA.groups).isdisjoint(set(kernTableB.groups))
    assert set(kernTableA.values).isdisjoint(set(kernTableB.values))

    mergedSourceIdentifiers = list(kernTableA.sourceIdentifiers)
    for sid in kernTableB.sourceIdentifiers:
        if sid not in mergedSourceIdentifiers:
            mergedSourceIdentifiers.append(sid)

    sidIndicesA = {sid: i for i, sid in enumerate(kernTableA.sourceIdentifiers)}
    sidIndicesB = {sid: i for i, sid in enumerate(kernTableB.sourceIdentifiers)}
    sidMapA = [(sid, sidIndicesA.get(sid)) for sid in mergedSourceIdentifiers]
    sidMapB = [(sid, sidIndicesB.get(sid)) for sid in mergedSourceIdentifiers]

    mappedValuesA = _remapKernValuesBySourceIdentifiers(kernTableA.values, sidMapA)
    mappedValuesB = _remapKernValuesBySourceIdentifiers(kernTableB.values, sidMapB)

    return Kerning(
        groups=kernTableA.groups | kernTableB.groups,
        sourceIdentifiers=mergedSourceIdentifiers,
        values=mappedValuesA | mappedValuesB,
    )


def _disambiguateKerningGroupNames(kernTableA, kernTableB):
    groupsNamesA = set(kernTableA.groups)
    groupsNamesB = set(kernTableB.groups)

    conflictingNames = groupsNamesA & groupsNamesB
    usedNames = groupsNamesA | groupsNamesB

    renameMap = {}
    for name in sorted(conflictingNames):
        count = 1
        while True:
            newName = f"{name}.{count}"
            if newName not in usedNames:
                break
            count += 1
        usedNames.add(newName)
        renameMap[name] = newName

    newGroups = {
        renameMap.get(name, name): group for name, group in kernTableA.groups.items()
    }

    newValues = {
        renameMap.get(left, left): {
            renameMap.get(right, right): values for right, values in rightDict.items()
        }
        for left, rightDict in kernTableA.values.items()
    }

    return replace(kernTableA, groups=newGroups, values=newValues)


def _remapKernValuesBySourceIdentifiers(kerningValues, sidMap):
    mappedKerningValues = {}

    for left, rightDict in kerningValues.items():
        mappedRightDict = {}

        for right, values in rightDict.items():
            mappedValues = [values[i] if i is not None else None for sid, i in sidMap]
            mappedRightDict[right] = mappedValues

        mappedKerningValues[left] = mappedRightDict

    return mappedKerningValues
