from typing import Protocol, runtime_checkable

from .classes import VariableGlyph


@runtime_checkable
class ReadableFontBackend(Protocol):
    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        ...


@runtime_checkable
class WritableFontBackend(ReadableFontBackend, Protocol):
    async def putGlyph(
        self, glyphName: str, glyph: VariableGlyph, codePoints: list[int]
    ) -> VariableGlyph:
        ...
