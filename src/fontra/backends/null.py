from dataclasses import dataclass
from typing import Any

from ..core.classes import (
    Axes,
    FontInfo,
    FontSource,
    Kerning,
    OpenTypeFeatures,
    VariableGlyph,
)


@dataclass(frozen=True)
class NullBackend:
    def __new__(cls):
        if not hasattr(cls, "instance"):
            cls.instance = super().__new__(cls)
        return cls.instance

    async def aclose(self) -> None:
        pass

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        return None

    async def getFontInfo(self) -> FontInfo:
        return FontInfo()

    async def getAxes(self) -> Axes:
        return Axes()

    async def getSources(self) -> dict[str, FontSource]:
        return {}

    async def getGlyphMap(self) -> dict[str, list[int]]:
        return {}

    async def getKerning(self) -> dict[str, Kerning]:
        return {}

    async def getFeatures(self) -> OpenTypeFeatures:
        return OpenTypeFeatures()

    async def getCustomData(self) -> dict[str, Any]:
        return {}

    async def getUnitsPerEm(self) -> int:
        return 1000
