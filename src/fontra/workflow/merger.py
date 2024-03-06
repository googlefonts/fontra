from copy import deepcopy
from dataclasses import dataclass
from typing import Any

from ..core.classes import GlobalAxis, GlobalDiscreteAxis, VariableGlyph
from ..core.protocols import ReadableFontBackend
from .actions import actionLogger


@dataclass(kw_only=True)
class FontBackendMerger:
    inputA: ReadableFontBackend
    inputB: ReadableFontBackend

    def __post_init__(self):
        self._glyphNamesA = None
        self._glyphNamesB = None
        self._glyphMap = None

    def close(self) -> None:
        pass

    async def _prepareGlyphMap(self):
        if self._glyphMap is not None:
            return
        glyphMapA = await self.inputA.getGlyphMap()
        glyphMapB = await self.inputB.getGlyphMap()
        self._glyphMap = glyphMapA | glyphMapB
        self._glyphNamesB = set(glyphMapB)
        self._glyphNamesA = set(glyphMapA)

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        await self._prepareGlyphMap()
        if glyphName in self._glyphNamesB:
            if glyphName in self._glyphNamesA:
                actionLogger.warning(
                    f"Merger: Glyph {glyphName!r} exists in both fonts"
                )
            return await self.inputB.getGlyph(glyphName)
        elif glyphName in self._glyphNamesA:
            return await self.inputA.getGlyph(glyphName)
        return None

    async def getGlobalAxes(self) -> list[GlobalAxis | GlobalDiscreteAxis]:
        axesA = await self.inputA.getGlobalAxes()
        axesB = await self.inputB.getGlobalAxes()
        axesByNameA = {axis.name: axis for axis in axesA}
        axisNamesB = {axis.name for axis in axesB}
        mergedAxes = []
        for axis in axesB:
            if axis.name in axesByNameA:
                axis = _mergeAxes(axesByNameA[axis.name], axis)
            mergedAxes.append(axis)

        for axis in axesA:
            if axis.name not in axisNamesB:
                mergedAxes.append(axis)

        return mergedAxes

    async def getGlyphMap(self) -> dict[str, list[int]]:
        await self._prepareGlyphMap()
        return self._glyphMap

    async def getCustomData(self) -> dict[str, Any]:
        customDataA = await self.inputA.getCustomData()
        customDataB = await self.inputB.getCustomData()
        return customDataA | customDataB

    async def getUnitsPerEm(self) -> int:
        unitsPerEmA = await self.inputA.getUnitsPerEm()
        unitsPerEmB = await self.inputB.getUnitsPerEm()
        if unitsPerEmA != unitsPerEmB:
            actionLogger.warning(
                f"Merger: Fonts have different units-per-em; A: {unitsPerEmA}, B: {unitsPerEmB}"
            )
        return unitsPerEmB


def _mergeAxes(axisA, axisB):
    # TODO: merge axis labels and axis value labels
    resultAxis = deepcopy(axisB)

    if axisA.mapping != axisB.mapping:
        actionLogger.error(
            "Merger: Axis mappings should be the same; "
            f"{axisA.name}, A: {axisA.mapping}, B: {axisB.mapping}"
        )

    if axisA.defaultValue != axisB.defaultValue:
        actionLogger.error(
            "Merger: Axis default values should be the same; "
            f"{axisA.name}, A: {axisA.defaultValue}, B: {axisB.defaultValue}"
        )

    if hasattr(axisA, "values") != hasattr(axisB, "values"):
        actionLogger.error(
            f"Merger: Can't merge continuous axis with discrete axis: {axisA.name}"
        )
    elif hasattr(axisA, "values"):
        resultAxis.values = sorted(set(axisA.values) | set(axisB.values))
    else:
        resultAxis.maxValue = max(axisA.maxValue, axisB.maxValue)
        resultAxis.minValue = min(axisA.minValue, axisB.minValue)

    return resultAxis
