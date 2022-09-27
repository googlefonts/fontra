from dataclasses import dataclass, field
from functools import partial
from enum import IntEnum
import dacite
from .packedpath import PackedPath, PointType


@dataclass(kw_only=True)
class Transformation:
    translateX: float = 0
    translateY: float = 0
    rotation: float = 0
    scaleX: float = 1
    scaleY: float = 1
    skewX: float = 0
    skewY: float = 0
    tCenterX: float = 0
    tCenterY: float = 0


Location = dict[str, float]


@dataclass
class Component:
    name: str
    transformation: Transformation = field(default_factory=Transformation)
    location: Location = field(default_factory=Location)


@dataclass
class StaticGlyph:
    path: PackedPath = field(default_factory=PackedPath)
    components: list[Component] = field(default_factory=list)
    xAdvance: float = 0
    yAdvance: float = 0
    verticalOrigin: float = 0


@dataclass
class Source:
    name: str
    location: Location
    layerName: str


@dataclass
class Layer:
    name: str
    glyph: StaticGlyph


@dataclass
class LocalAxis:
    name: str
    minValue: float
    defaultValue: float
    maxValue: float


@dataclass
class VariableGlyph:
    name: str
    axes: list[LocalAxis] = field(default_factory=list)
    unicodes: list[int] = field(default_factory=list)
    sources: list[Source] = field(default_factory=list)
    layers: list[Layer] = field(default_factory=list)


@dataclass
class GlobalAxis:
    name: str
    tag: str
    minValue: float
    defaultValue: float
    maxValue: float
    mapping: list[tuple[int, int]] = field(default_factory=list)


_castConfig = dacite.Config(cast=[PointType])
from_dict = partial(dacite.from_dict, config=_castConfig)
