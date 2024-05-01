from __future__ import annotations

import os
import pathlib
from contextlib import AsyncExitStack, asynccontextmanager, contextmanager
from dataclasses import dataclass, field
from importlib.metadata import entry_points
from typing import AsyncGenerator, NamedTuple

from ..core.protocols import ReadableFontBackend
from .actions import (
    ActionError,
    FilterActionProtocol,
    InputActionProtocol,
    OutputActionProtocol,
    OutputProcessorProtocol,
    getActionClass,
)
from .merger import FontBackendMerger


@contextmanager
def chdir(path):
    # contextlib.chdir() requires Python >= 3.11
    currentDir = os.getcwd()
    os.chdir(path)
    try:
        yield
    finally:
        os.chdir(currentDir)


def _loadActionsEntryPoints():
    for entryPoint in entry_points(group="fontra.workflow.actions"):
        _ = entryPoint.load()


_loadActionsEntryPoints()


@dataclass(kw_only=True)
class Workflow:
    config: dict
    parentDir: os.PathLike = field(default_factory=pathlib.Path)
    steps: list[ActionStep] = field(init=False)

    def __post_init__(self):
        self.steps = _structureSteps(self.config["steps"])

    @asynccontextmanager
    async def endPoints(
        self, input: ReadableFontBackend | None = None
    ) -> AsyncGenerator[WorkflowEndPoints, None]:
        async with AsyncExitStack() as exitStack:
            with chdir(self.parentDir):
                endPoints = await _prepareEndPoints(input, self.steps, exitStack)
            yield endPoints


class WorkflowEndPoints(NamedTuple):
    endPoint: ReadableFontBackend | None
    outputs: list[OutputProcessorProtocol]


async def _prepareEndPoints(
    currentInput: ReadableFontBackend | None,
    steps: list[ActionStep],
    exitStack: AsyncExitStack,
) -> WorkflowEndPoints:
    outputs: list[OutputProcessorProtocol] = []

    for step in steps:
        currentInput, newOutputs = await step.setup(currentInput, exitStack)
        outputs.extend(newOutputs)

    return WorkflowEndPoints(currentInput, outputs)


@dataclass(kw_only=True)
class ActionStep:
    actionName: str
    arguments: dict
    steps: list[ActionStep] = field(default_factory=list)

    def getAction(self):
        actionClass = getActionClass(self.actionType, self.actionName)
        action = actionClass(**self.arguments)
        assert isinstance(action, self.actionProtocol)
        return action

    async def setup(self, currentInput, exitStack):
        raise NotImplementedError


_actionStepClasses = {}


def registerActionStepClass(cls):
    assert cls.actionType not in _actionStepClasses
    _actionStepClasses[cls.actionType] = cls
    return cls


@registerActionStepClass
@dataclass(kw_only=True)
class InputActionStep(ActionStep):
    actionProtocol = InputActionProtocol
    actionType = "input"

    async def setup(self, currentInput, exitStack):
        action = self.getAction()

        backend = await exitStack.enter_async_context(action.prepare())
        assert isinstance(backend, ReadableFontBackend)

        # set up nested steps
        backend, outputs = await _prepareEndPoints(backend, self.steps, exitStack)

        if currentInput is None:
            currentInput = backend
        else:
            currentInput = FontBackendMerger(inputA=currentInput, inputB=backend)
        return currentInput, outputs


@registerActionStepClass
@dataclass(kw_only=True)
class FilterActionStep(ActionStep):
    actionProtocol = FilterActionProtocol
    actionType = "filter"

    async def setup(self, currentInput, exitStack):
        action = self.getAction()

        assert currentInput is not None

        backend = await exitStack.enter_async_context(action.connect(currentInput))

        # set up nested steps
        backend, outputs = await _prepareEndPoints(backend, self.steps, exitStack)

        return backend, outputs


@registerActionStepClass
@dataclass(kw_only=True)
class OutputActionStep(ActionStep):
    actionProtocol = OutputActionProtocol
    actionType = "output"

    async def setup(self, currentInput, exitStack):
        assert currentInput is not None
        action = self.getAction()

        outputs = []

        # set up nested steps
        outputStepsResult, moreOutput = await _prepareEndPoints(
            currentInput, self.steps, exitStack
        )
        outputs.extend(moreOutput)

        assert isinstance(outputStepsResult, ReadableFontBackend)
        action = await exitStack.enter_async_context(action.connect(outputStepsResult))
        assert isinstance(action, OutputProcessorProtocol)
        outputs.append(action)

        return currentInput, outputs


def _structureSteps(rawSteps):
    structured = []

    for rawStep in rawSteps:
        actionName = None
        for actionType in _actionStepClasses:
            actionName = rawStep.get(actionType)
            if actionName is None:
                continue
            break
        if actionName is None:
            raise ActionError("no action type keyword found in step")
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
