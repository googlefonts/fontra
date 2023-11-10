from dataclasses import dataclass, field
from typing import Optional, TypedDict


class Point(TypedDict):
    x: float
    y: float
    type: Optional[str]
    smooth: Optional[bool] = False


@dataclass
class Contour:
    points: list[Point] = field(default_factory=[])
    isClosed: bool = False


@dataclass
class Path:
    contours: list[Contour] = field(default_factory=[])
