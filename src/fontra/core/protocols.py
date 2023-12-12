from __future__ import annotations

import argparse
from types import SimpleNamespace
from typing import Any, AsyncGenerator, Callable, Protocol, runtime_checkable

from aiohttp import web

from .classes import VariableGlyph


@runtime_checkable
class ReadableFontBackend(Protocol):
    def close(self) -> None:
        ...

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        ...


@runtime_checkable
class WritableFontBackend(ReadableFontBackend, Protocol):
    async def putGlyph(
        self, glyphName: str, glyph: VariableGlyph, codePoints: list[int]
    ) -> VariableGlyph:
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

    async def authorize(self, request: web.Request) -> str:
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
