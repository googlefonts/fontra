from __future__ import annotations

import argparse
from types import SimpleNamespace
from typing import Any, AsyncGenerator, Callable, Protocol, runtime_checkable

from aiohttp import web

from .classes import GlobalAxis, GlobalDiscreteAxis, VariableGlyph


@runtime_checkable
class ReadableFontBackend(Protocol):
    def close(self) -> None:
        ...

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        ...

    async def getGlobalAxes(self) -> list[GlobalAxis | GlobalDiscreteAxis]:
        ...

    async def getGlyphMap(self) -> dict[str, list[int]]:
        ...

    async def getCustomData(self) -> dict[str, Any]:
        ...

    async def getUnitsPerEm(self) -> int:
        ...


@runtime_checkable
class WritableFontBackend(ReadableFontBackend, Protocol):
    async def putGlyph(
        self, glyphName: str, glyph: VariableGlyph, codePoints: list[int]
    ) -> None:
        ...

    async def deleteGlyph(self, glyphName: str) -> None:
        ...

    async def putGlobalAxes(self, value: list[GlobalAxis | GlobalDiscreteAxis]) -> None:
        ...

    async def putGlyphMap(self, value: dict[str, list[int]]) -> None:
        ...

    async def putCustomData(self, value: dict[str, Any]) -> None:
        ...

    async def putUnitsPerEm(self, value: int) -> None:
        ...


@runtime_checkable
class WatchableFontBackend(Protocol):
    async def watchExternalChanges(self) -> AsyncGenerator[tuple[Any, Any], None]:
        if False:
            yield None, None


@runtime_checkable
class ProjectManagerFactory(Protocol):
    @staticmethod
    def addArguments(parser: argparse.ArgumentParser) -> None:
        ...

    @staticmethod
    def getProjectManager(arguments: SimpleNamespace) -> ProjectManager:
        ...


@runtime_checkable
class ProjectManager(Protocol):
    async def close(self) -> None:
        ...

    async def authorize(self, request: web.Request) -> str | None:
        ...

    async def projectAvailable(self, path: str, token: str) -> bool:
        ...

    async def getRemoteSubject(self, path: str, token: str) -> Any:
        ...

    async def getProjectList(self, token: str) -> list[str]:
        ...

    async def projectPageHandler(
        self, request: web.Request, filterContent: Callable | None = None
    ) -> web.Response:
        ...

    def setupWebRoutes(self, server) -> None:
        ...
