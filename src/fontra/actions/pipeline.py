from __future__ import annotations

import os
from dataclasses import dataclass, field

import yaml

from ..core.protocols import ReadableFontBackend


@dataclass(kw_only=True)
class Pipeline:
    config: dict
    steps: list[ActionStep | InputStep | OutputStep] = field(
        init=False, default_factory=list
    )

    @classmethod
    def fromYAMLFile(cls, path):
        with open(path) as file:
            config = yaml.safe_load(file)
        return cls(config=config)

    def __post_init__(self):
        self.steps = _structureSteps(self.config["steps"])


@dataclass(kw_only=True)
class ActionStep:
    name: str
    arguments: dict
    steps: list[ActionStep | InputStep | OutputStep] = field(default_factory=list)
    action: ReadableFontBackend | None = field(init=False, default=None)


@dataclass(kw_only=True)
class InputStep:
    source: os.PathLike
    steps: list[ActionStep | InputStep | OutputStep] = field(default_factory=list)
    sourceFont: ReadableFontBackend | None = field(init=False, default=None)

    # def __post_init__(self):
    #     self.sourceFont = getFileSystemBackend(self.source)


@dataclass(kw_only=True)
class OutputStep:
    destination: os.PathLike
    steps: list[ActionStep | InputStep | OutputStep] = field(default_factory=list)


def _structureSteps(rawSteps):
    structured = []
    for rawStep in rawSteps:
        actionName = rawStep["action"]
        arguments = dict(rawStep)
        arguments.pop("action")
        subSteps = _structureSteps(arguments.pop("steps", []))

        match actionName:
            case "input":
                step = _structureInputStep(arguments, subSteps)
            case "output":
                step = _structureOuputstep(arguments, subSteps)
            case _:
                step = _structureActionStep(actionName, arguments, subSteps)

        structured.append(step)

    return structured


def _structureInputStep(arguments, steps):
    return InputStep(source=arguments["source"], steps=steps)


def _structureOuputstep(arguments, steps):
    return OutputStep(destination=arguments["destination"], steps=steps)


def _structureActionStep(actionName, arguments, steps):
    return ActionStep(name=actionName, arguments=arguments, steps=steps)
