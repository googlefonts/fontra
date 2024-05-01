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
        action = step.getAction()

        match step.actionType:
            case "input":
                assert isinstance(action, InputActionProtocol)
                action = await exitStack.enter_async_context(action.prepare())
                assert isinstance(action, ReadableFontBackend)

                # set up nested steps
                action, moreOutput = await _prepareEndPoints(
                    action, step.steps, exitStack
                )
                outputs.extend(moreOutput)

                if currentInput is None:
                    currentInput = action
                else:
                    currentInput = FontBackendMerger(inputA=currentInput, inputB=action)
            case "filter":
                assert isinstance(action, FilterActionProtocol)
                assert currentInput is not None

                action = await exitStack.enter_async_context(
                    action.connect(currentInput)
                )

                # set up nested steps
                action, moreOutput = await _prepareEndPoints(
                    action, step.steps, exitStack
                )
                outputs.extend(moreOutput)

                currentInput = action
            case "output":
                assert isinstance(action, OutputActionProtocol)
                assert currentInput is not None

                # set up nested steps
                outputStepsResult, moreOutput = await _prepareEndPoints(
                    currentInput, step.steps, exitStack
                )
                outputs.extend(moreOutput)

                assert isinstance(outputStepsResult, ReadableFontBackend)
                action = await exitStack.enter_async_context(
                    action.connect(outputStepsResult)
                )
                outputs.append(action)
            case _:
                raise AssertionError("Expected code to be unreachable")

    return WorkflowEndPoints(currentInput, outputs)


@dataclass(kw_only=True)
class ActionStep:
    actionType: str
    actionName: str
    arguments: dict
    steps: list[ActionStep] = field(default_factory=list)

    def getAction(self):
        actionClass = self.getActionClass()
        return actionClass(**self.arguments)

    def getActionClass(self):
        return getActionClass(self.actionType, self.actionName)


@dataclass(kw_only=True)
class InputActionStep(ActionStep):
    actionProtocol = InputActionProtocol


@dataclass(kw_only=True)
class FilterActionStep(ActionStep):
    actionProtocol = FilterActionProtocol


@dataclass(kw_only=True)
class OutputActionStep(ActionStep):
    actionProtocol = OutputActionProtocol


_actionTypes = ["input", "filter", "output"]


def _structureSteps(rawSteps):
    structured = []

    for rawStep in rawSteps:
        actionName = None
        for actionType in _actionTypes:
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
            ActionStep(
                actionType=actionType,
                actionName=actionName,
                arguments=arguments,
                steps=subSteps,
            )
        )

    return structured
