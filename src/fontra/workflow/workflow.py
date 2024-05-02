from __future__ import annotations

import os
import pathlib
from contextlib import AsyncExitStack, asynccontextmanager, contextmanager
from dataclasses import dataclass, field
from importlib.metadata import entry_points
from typing import AsyncGenerator, ClassVar

from ..backends.null import NullBackend
from ..core.protocols import ReadableFontBackend
from .actions import (
    FilterActionProtocol,
    InputActionProtocol,
    OutputActionProtocol,
    OutputProcessorProtocol,
    getActionClass,
)
from .merger import FontBackendMerger


class WorkflowError(Exception):
    pass


@dataclass(kw_only=True)
class Workflow:
    config: dict
    parentDir: os.PathLike = field(default_factory=pathlib.Path)
    steps: list[ActionStep] = field(init=False)

    def __post_init__(self):
        self.steps = _structureSteps(self.config["steps"])
        _loadActionsEntryPoints()

    @asynccontextmanager
    async def endPoints(
        self, input: ReadableFontBackend | None = None
    ) -> AsyncGenerator[WorkflowEndPoints, None]:
        if input is None:
            input = NullBackend()
        async with AsyncExitStack() as exitStack:
            with chdir(self.parentDir):
                endPoints = await _prepareEndPoints(input, self.steps, exitStack)
            yield endPoints


@dataclass(frozen=True)
class WorkflowEndPoints:
    endPoint: ReadableFontBackend
    outputs: list[OutputProcessorProtocol]


@dataclass(kw_only=True)
class ActionStep:
    actionName: str
    arguments: dict
    steps: list[ActionStep] = field(default_factory=list)
    actionType: ClassVar[str]

    def getAction(
        self,
    ) -> InputActionProtocol | FilterActionProtocol | OutputActionProtocol:
        actionClass = getActionClass(self.actionType, self.actionName)
        action = actionClass(**self.arguments)
        assert isinstance(
            action, (InputActionProtocol, FilterActionProtocol, OutputActionProtocol)
        )
        return action

    async def setup(
        self, currentInput: ReadableFontBackend, exitStack
    ) -> WorkflowEndPoints:
        raise NotImplementedError


_actionStepClasses = {}


def registerActionStepClass(cls):
    assert cls.actionType not in _actionStepClasses
    _actionStepClasses[cls.actionType] = cls
    return cls


@registerActionStepClass
@dataclass(kw_only=True)
class InputActionStep(ActionStep):
    actionType = "input"

    async def setup(
        self, currentInput: ReadableFontBackend, exitStack
    ) -> WorkflowEndPoints:
        action = self.getAction()
        assert isinstance(action, InputActionProtocol)

        backend = await exitStack.enter_async_context(action.prepare())
        assert isinstance(backend, ReadableFontBackend)

        # set up nested steps
        endPoints = await _prepareEndPoints(backend, self.steps, exitStack)

        endPoint = FontBackendMerger(inputA=currentInput, inputB=endPoints.endPoint)
        return WorkflowEndPoints(endPoint=endPoint, outputs=endPoints.outputs)


@registerActionStepClass
@dataclass(kw_only=True)
class FilterActionStep(ActionStep):
    actionType = "filter"

    async def setup(
        self, currentInput: ReadableFontBackend, exitStack
    ) -> WorkflowEndPoints:
        action = self.getAction()
        assert isinstance(action, FilterActionProtocol)

        backend = await exitStack.enter_async_context(action.connect(currentInput))

        # set up nested steps
        return await _prepareEndPoints(backend, self.steps, exitStack)


@registerActionStepClass
@dataclass(kw_only=True)
class OutputActionStep(ActionStep):
    actionType = "output"

    async def setup(
        self, currentInput: ReadableFontBackend, exitStack
    ) -> WorkflowEndPoints:
        assert currentInput is not None
        action = self.getAction()
        assert isinstance(action, OutputActionProtocol)

        outputs = []

        # set up nested steps
        endPoints = await _prepareEndPoints(currentInput, self.steps, exitStack)
        outputs.extend(endPoints.outputs)

        assert isinstance(endPoints.endPoint, ReadableFontBackend)
        processor = await exitStack.enter_async_context(
            action.connect(endPoints.endPoint)
        )
        assert isinstance(processor, OutputProcessorProtocol)
        outputs.append(processor)

        return WorkflowEndPoints(endPoint=currentInput, outputs=outputs)


def _structureSteps(rawSteps) -> list[ActionStep]:
    structured = []

    for rawStep in rawSteps:
        actionName = None
        for actionType in _actionStepClasses:
            actionName = rawStep.get(actionType)
            if actionName is None:
                continue
            break
        if actionName is None:
            raise WorkflowError("no action type keyword found in step")
        arguments = dict(rawStep)
        del arguments[actionType]
        subSteps = _structureSteps(arguments.pop("steps", []))
        structured.append(
            _actionStepClasses[actionType](
                actionName=actionName,
                arguments=arguments,
                steps=subSteps,
            )
        )

    return structured


async def _prepareEndPoints(
    currentInput: ReadableFontBackend,
    steps: list[ActionStep],
    exitStack: AsyncExitStack,
) -> WorkflowEndPoints:
    outputs: list[OutputProcessorProtocol] = []

    for step in steps:
        endPoints = await step.setup(currentInput, exitStack)
        currentInput = endPoints.endPoint
        outputs.extend(endPoints.outputs)

    return WorkflowEndPoints(currentInput, outputs)


def _loadActionsEntryPoints():
    from .actions import axes  # noqa: F401
    from .actions import base  # noqa: F401
    from .actions import features  # noqa: F401
    from .actions import glyph  # noqa: F401
    from .actions import misc  # noqa: F401
    from .actions import subset  # noqa: F401

    for entryPoint in entry_points(group="fontra.workflow.actions"):
        _ = entryPoint.load()


@contextmanager
def chdir(path):
    # contextlib.chdir() requires Python >= 3.11
    currentDir = os.getcwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(currentDir)
