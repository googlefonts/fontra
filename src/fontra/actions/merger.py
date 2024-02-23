from dataclasses import dataclass
from typing import Any

from ..core.classes import GlobalAxis, GlobalDiscreteAxis, VariableGlyph
from ..core.protocols import ReadableFontBackend


@dataclass(kw_only=True)
class FontBackendMerger:
    inputA: ReadableFontBackend
    inputB: ReadableFontBackend

    def __post_init__(self):
        self._glyphNamesA = None
        self._glyphNamesB = None
        self._glyphMap = None

    def close(self) -> None:
        ...

    async def _prepareGlyphMap(self):
        if self._glyphMap is not None:
            return
        glyphMapA = await self.inputA.getGlyphMap()
        glyphMapB = await self.inputB.getGlyphMap()
        self._glyphMap = glyphMapA | glyphMapB
        self._glyphNamesB = set(glyphMapB)
        self._glyphNamesA = set(glyphMapA) - self._glyphNamesB

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        await self._prepareGlyphMap()
        if glyphName in self._glyphNamesB:
            return await self.inputB.getGlyph(glyphName)
        elif glyphName in self._glyphNamesA:
            return await self.inputA.getGlyph(glyphName)
        return None

    async def getGlobalAxes(self) -> list[GlobalAxis | GlobalDiscreteAxis]:
        # TODO: merge axes
        # - axis by name
        # - expand axis ranges
        # - check default axis loc
        # - check conflicting axis mapping
        # - check conflicting axis labels
        return await self.inputB.getGlobalAxes()

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
            # TODO: warn
            pass
        return unitsPerEmB
