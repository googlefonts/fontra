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

    async def getSources(self) -> dict[str, FontSource]:
        sourcesA = await self.inputA.getSources()
        sourcesB = await self.inputB.getSources()
        return sourcesA | sourcesB

    async def getGlyphMap(self) -> dict[str, list[int]]:
        await self._prepareGlyphMap()
        return self._glyphMap

    async def getKerning(self) -> dict[str, Kerning]:
        # TODO: merge kerning
        # kerningA = await self.inputA.getKerning()
        kerningB = await self.inputB.getKerning()
        return kerningB

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
