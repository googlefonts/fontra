from __future__ import annotations

import os
import pathlib
from functools import partial
from typing import AsyncContextManager, Protocol, runtime_checkable

from ...core.protocols import ReadableFontBackend


class ActionError(Exception):
    pass


@runtime_checkable
class FilterActionProtocol(Protocol):
    def connect(
        self, input: ReadableFontBackend
    ) -> AsyncContextManager[ReadableFontBackend]:
        pass


@runtime_checkable
class InputActionProtocol(Protocol):
    def prepare(self) -> AsyncContextManager[ReadableFontBackend]:
        pass


@runtime_checkable
class OutputActionProtocol(Protocol):
    def connect(
        self, input: ReadableFontBackend
    ) -> AsyncContextManager[OutputProcessorProtocol]:
        pass


@runtime_checkable
class OutputProcessorProtocol(Protocol):
    async def process(
        self, outputDir: os.PathLike = pathlib.Path(), *, continueOnError=False
    ) -> None:
        pass


_actionRegistry: dict[str, dict[str, type]] = {
    "filter": {},
    "input": {},
    "output": {},
}


def _actionRegistryWrapper(cls, actionName, actionType):
    registry = _actionRegistry[actionType]
    assert actionName not in registry
    cls.actionName = actionName
    registry[actionName] = cls
    return cls


def getActionClass(actionType: str, actionName: str) -> type:
    registry = _actionRegistry[actionType]
    cls = registry.get(actionName)
    if cls is None:
        raise KeyError(f"No action found named '{actionName}'")
    return cls


def registerFilterAction(actionName):
    return partial(_actionRegistryWrapper, actionName=actionName, actionType="filter")


def registerInputAction(actionName):
    return partial(_actionRegistryWrapper, actionName=actionName, actionType="input")


def registerOutputAction(actionName):
    return partial(_actionRegistryWrapper, actionName=actionName, actionType="output")
