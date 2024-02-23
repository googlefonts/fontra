from __future__ import annotations

from dataclasses import dataclass, field

import yaml

from ..core.protocols import ReadableFontBackend
from .actions import ConnectableActionProtocol, OutputActionProtocol, getActionClass
from .merger import FontBackendMerger


@dataclass(kw_only=True)
class Pipeline:
    config: dict
    steps: list[ActionStep] = field(init=False)

    @classmethod
    def fromYAMLFile(cls, path):
        with open(path) as file:
            config = yaml.safe_load(file)
        return cls(config=config)

    def __post_init__(self):
        self.steps = _structureSteps(self.config["steps"])

    def prepareSteps(self) -> Runner:
        return Runner(steps=self.steps)


@dataclass(kw_only=True)
class Runner:
    steps: list[ActionStep]


def _setupActionSteps(
    currentInput: ReadableFontBackend | None, steps: list[ActionStep]
) -> tuple[ReadableFontBackend | None, list[OutputActionProtocol]]:
    outputs: list[OutputActionProtocol] = []

    for step in steps:
        actionClass = getActionClass(step.name)
        action = actionClass(**step.arguments)
        if isinstance(action, ConnectableActionProtocol):
            # filter action or output
            assert currentInput is not None
            action.connect(currentInput)
            if isinstance(action, ReadableFontBackend):
                # filter action
                currentInput = action
            else:
                # output
                assert isinstance(action, OutputActionProtocol)
                outputs.append(action)
        else:
            # input
            if currentInput is None:
                currentInput = action
            else:
                currentInput = FontBackendMerger(inputA=currentInput, inputB=action)

    return currentInput, outputs


@dataclass(kw_only=True)
class ActionStep:
    name: str
    arguments: dict
    steps: list[ActionStep] = field(default_factory=list)
    action: ReadableFontBackend | ConnectableActionProtocol | OutputActionProtocol | None = field(
        init=False, default=None
    )


def _structureSteps(rawSteps):
    structured = []

    for rawStep in rawSteps:
        actionName = rawStep["action"]
        arguments = dict(rawStep)
        arguments.pop("action")
        subSteps = _structureSteps(arguments.pop("steps", []))
        structured.append(
            ActionStep(name=actionName, arguments=arguments, steps=subSteps)
        )

    return structured
