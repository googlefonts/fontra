from __future__ import annotations

from dataclasses import dataclass, field

import yaml

from ..core.protocols import ReadableFontBackend
from .actions import ConnectableAction, OutputAction


@dataclass(kw_only=True)
class Pipeline:
    config: dict
    steps: list[ActionStep] = field(init=False, default_factory=list)

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
    steps: list[ActionStep] = field(default_factory=list)
    action: ReadableFontBackend | ConnectableAction | OutputAction | None = field(
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
