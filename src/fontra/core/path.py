import logging
from copy import copy, deepcopy
from dataclasses import dataclass, field, replace
from enum import IntEnum
from typing import TypedDict

from fontTools.misc.transform import DecomposedTransform

logger = logging.getLogger(__name__)


class InterpolationError(Exception):
    pass


# Path, aka "unpacked path", but structured


class Point(TypedDict, total=False):
    x: float
    y: float
    type: str  # Py 3.11: NotRequired[str]
    smooth: bool  # Py 3.11: NotRequired[bool]


@dataclass
class Contour:
    points: list[Point] = field(default_factory=list)
    isClosed: bool = False


@dataclass
class Path:
    contours: list[Contour] = field(default_factory=list)

    def asPath(self):
        return self

    def asPackedPath(self):
        from .classes import unstructure

        return PackedPath.fromUnpackedContours(unstructure(self.contours))

    def isEmpty(self):
        return not self.contours

    def drawPoints(self, pen):
        raise NotImplementedError()

    def transformed(self, transform):
        raise NotImplementedError()


# Packed Path


@dataclass
class ContourInfo:
    endPoint: int
    isClosed: bool = False


class PointType(IntEnum):
    ON_CURVE = 0x00
    OFF_CURVE_QUAD = 0x01
    OFF_CURVE_CUBIC = 0x02
    ON_CURVE_SMOOTH = 0x08


@dataclass
class PackedPath:
    coordinates: list[float] = field(default_factory=list)
    pointTypes: list[PointType] = field(default_factory=list)
    contourInfo: list[ContourInfo] = field(default_factory=list)

    @classmethod
    def fromUnpackedContours(cls, unpackedContours):
        coordinates = []
        pointTypes = []
        contourInfo = []
        packedContours = [_packContour(c) for c in unpackedContours]
        for packedContour in packedContours:
            coordinates.extend(packedContour["coordinates"])
            pointTypes.extend(packedContour["pointTypes"])
            contourInfo.append(
                ContourInfo(
                    endPoint=len(pointTypes) - 1, isClosed=packedContour["isClosed"]
                )
            )
        return cls(
            coordinates=coordinates, pointTypes=pointTypes, contourInfo=contourInfo
        )

    def asPath(self):
        from .classes import structure

        return Path(contours=structure(self.unpackedContours(), list[Contour]))

    def asPackedPath(self):
        return self

    def isEmpty(self):
        return not self.contourInfo

    def appendPath(self, path):
        self.coordinates.extend(path.coordinates)
        self.pointTypes.extend(path.pointTypes)
        endPointOffset = (
            0 if not self.contourInfo else self.contourInfo[-1].endPoint + 1
        )
        self.contourInfo.extend(
            replace(contourInfo, endPoint=contourInfo.endPoint + endPointOffset)
            for contourInfo in path.contourInfo
        )

    def transformed(self, transform):
        coordinates = self.coordinates
        newCoordinates = []
        for i in range(0, len(self.coordinates), 2):
            newCoordinates.extend(transform.transformPoint(coordinates[i : i + 2]))
        return replace(self, coordinates=newCoordinates)

    def unpackedContours(self):
        unpackedContours = []
        coordinates = self.coordinates
        pointTypes = self.pointTypes
        startIndex = 0
        for contourInfo in self.contourInfo:
            endIndex = contourInfo.endPoint + 1
            points = list(_iterPoints(coordinates, pointTypes, startIndex, endIndex))
            unpackedContours.append(dict(points=points, isClosed=contourInfo.isClosed))
            startIndex = endIndex
        return unpackedContours

    def drawPoints(self, pen):
        startPoint = 0
        for contourInfo in self.contourInfo:
            endIndex = contourInfo.endPoint + 1
            coordinates = self.coordinates[startPoint * 2 : endIndex * 2]
            points = list(pairwise(coordinates))
            pointTypes = self.pointTypes[startPoint:endIndex]
            if not contourInfo.isClosed:
                # strip leading and trailing off-curve points, they cause
                # validation problems
                for index in [-1, 0]:
                    while pointTypes and pointTypes[index] in (
                        PointType.OFF_CURVE_QUAD,
                        PointType.OFF_CURVE_CUBIC,
                    ):
                        del points[index]
                        del pointTypes[index]
            if not pointTypes:
                # Don't write empty contours
                continue
            assert len(points) == len(pointTypes)
            pen.beginPath()
            segmentType = (
                _pointToSegmentType.get(pointTypes[-1], "line")
                if contourInfo.isClosed
                else "move"
            )
            for point, pointType in zip(points, pointTypes):
                isSmooth = False
                pointSegmentType = None
                if pointType == PointType.ON_CURVE:
                    pointSegmentType = segmentType
                elif pointType == PointType.ON_CURVE_SMOOTH:
                    pointSegmentType = segmentType
                    isSmooth = True
                pen.addPoint(
                    point,
                    segmentType=pointSegmentType,
                    smooth=isSmooth,
                )
                segmentType = _pointToSegmentType.get(pointType, "line")
            pen.endPath()
            startPoint = endIndex

    def setPointPosition(self, pointIndex, x, y):
        coords = self.coordinates
        i = pointIndex * 2
        coords[i] = x
        coords[i + 1] = y

    def deleteContour(self, contourIndex):
        contourIndex = self._normalizeContourIndex(contourIndex)
        contour = self.contourInfo[contourIndex]
        startPoint = self._getContourStartPoint(contourIndex)
        numPoints = contour.endPoint + 1 - startPoint
        self._replacePoints(startPoint, numPoints, [], [])
        del self.contourInfo[contourIndex]
        self._moveEndPoints(contourIndex, -numPoints)

    def insertContour(self, contourIndex, contour):
        contourIndex = self._normalizeContourIndex(contourIndex, True)
        startPoint = self._getContourStartPoint(contourIndex)
        self._replacePoints(
            startPoint, 0, contour["coordinates"], contour["pointTypes"]
        )
        contourInfo = ContourInfo(endPoint=startPoint - 1, isClosed=contour["isClosed"])
        self.contourInfo.insert(contourIndex, contourInfo)
        self._moveEndPoints(contourIndex, len(contour["pointTypes"]))

    def deletePoint(self, contourIndex, contourPointIndex):
        contourIndex = self._normalizeContourIndex(contourIndex)
        pointIndex = self._getAbsolutePointIndex(contourIndex, contourPointIndex)
        self._replacePoints(pointIndex, 1, [], [])
        self._moveEndPoints(contourIndex, -1)

    def insertPoint(self, contourIndex, contourPointIndex, point):
        contourIndex = self._normalizeContourIndex(contourIndex)
        pointIndex = self._getAbsolutePointIndex(contourIndex, contourPointIndex, True)
        pointType = packPointType(point.get("type"), point.get("smooth"))
        self._replacePoints(pointIndex, 0, [point["x"], point["y"]], [pointType])
        self._moveEndPoints(contourIndex, 1)

    def _getContourStartPoint(self, contourIndex):
        return (
            0 if contourIndex == 0 else self.contourInfo[contourIndex - 1].endPoint + 1
        )

    def _getAbsolutePointIndex(self, contourIndex, contourPointIndex, forInsert=False):
        startPoint = self._getContourStartPoint(contourIndex)
        contour = self.contourInfo[contourIndex]
        numPoints = contour.endPoint + 1 - startPoint
        originalContourPointIndex = contourPointIndex
        if contourPointIndex < 0:
            contourPointIndex += numPoints
        if contourPointIndex < 0 or (
            contourPointIndex >= numPoints + (1 if forInsert else 0)
        ):
            raise IndexError(
                f"contourPointIndex out of bounds: {originalContourPointIndex}"
            )
        return startPoint + contourPointIndex

    def _normalizeContourIndex(self, contourIndex, forInsert=False):
        originalContourIndex = contourIndex
        numContours = len(self.contourInfo)
        if contourIndex < 0:
            contourIndex += numContours
        bias = 1 if forInsert else 0
        if contourIndex < 0 or contourIndex >= numContours + bias:
            raise IndexError(f"contourIndex out of bounds: {originalContourIndex}")
        return contourIndex

    def _replacePoints(self, startPoint, numPoints, coordinates, pointTypes):
        dblIndex = startPoint * 2
        self.coordinates[dblIndex : dblIndex + numPoints * 2] = coordinates
        self.pointTypes[startPoint : startPoint + numPoints] = pointTypes

    def _moveEndPoints(self, fromContourIndex, offset):
        for contourInfo in self.contourInfo[fromContourIndex:]:
            contourInfo.endPoint += offset

    def _ensureCompatibility(self, other):
        if self.contourInfo != other.contourInfo:
            # TODO: we should also compare self.pointTypes with other.pointTypes,
            # but ignoring the smooth flag
            # TODO: more specific exception
            raise InterpolationError("paths are not compatible")

    def __sub__(self, other):
        self._ensureCompatibility(other)
        coordinates = [v1 - v2 for v1, v2 in zip(self.coordinates, other.coordinates)]
        return PackedPath(
            coordinates, list(self.pointTypes), deepcopy(self.contourInfo)
        )

    def __add__(self, other):
        self._ensureCompatibility(other)
        coordinates = [v1 + v2 for v1, v2 in zip(self.coordinates, other.coordinates)]
        return PackedPath(
            coordinates, list(self.pointTypes), deepcopy(self.contourInfo)
        )

    def __mul__(self, scalar):
        coordinates = [v * scalar for v in self.coordinates]
        return PackedPath(
            coordinates, list(self.pointTypes), deepcopy(self.contourInfo)
        )


def joinPaths(paths) -> PackedPath:
    result = PackedPath()
    for path in paths:
        result.appendPath(path)
    return result


class PackedPathPointPen:
    def __init__(self):
        self.coordinates = []
        self.pointTypes = []
        self.contourInfo = []
        self.components = []
        self._currentContour = None

    def getPath(self):
        return PackedPath(
            self.coordinates,
            [PointType(tp) for tp in self.pointTypes],
            self.contourInfo,
        )

    def beginPath(self, **kwargs):
        self._currentContour = []

    def addPoint(self, pt, segmentType=None, smooth=False, *args, **kwargs):
        self._currentContour.append((pt, segmentType, smooth))

    def endPath(self):
        if not self._currentContour:
            return
        isClosed = self._currentContour[0][1] != "move"
        isQuadBlob = all(
            segmentType is None for _, segmentType, _ in self._currentContour
        )
        if isQuadBlob:
            self.pointTypes.extend(
                [PointType.OFF_CURVE_QUAD] * len(self._currentContour)
            )
            for pt, _, _ in self._currentContour:
                self.coordinates.extend(pt)
        else:
            pointTypes = []
            for pt, segmentType, smooth in self._currentContour:
                if segmentType is None:
                    pointTypes.append(PointType.OFF_CURVE_CUBIC)
                elif segmentType in {"move", "line", "curve", "qcurve"}:
                    pointTypes.append(
                        PointType.ON_CURVE_SMOOTH if smooth else PointType.ON_CURVE
                    )
                else:
                    raise TypeError(f"unexpected segment type: {segmentType}")

                self.coordinates.extend(pt)
            assert len(pointTypes) == len(self._currentContour)
            # Fix the quad point types
            for i, (_, segmentType, _) in enumerate(self._currentContour):
                if segmentType == "qcurve":
                    stopIndex = i - len(pointTypes) if isClosed else -1
                    for j in range(i - 1, stopIndex, -1):
                        if pointTypes[j] != PointType.OFF_CURVE_CUBIC:
                            break
                        pointTypes[j] = PointType.OFF_CURVE_QUAD
            self.pointTypes.extend(pointTypes)
        self.contourInfo.append(
            ContourInfo(endPoint=len(self.coordinates) // 2 - 1, isClosed=isClosed)
        )
        self._currentContour = None

    def addComponent(self, glyphName, transformation, **kwargs):
        from .classes import Component

        transformation = DecomposedTransform.fromTransform(transformation)
        self.components.append(Component(glyphName, transformation))

    def addVarComponent(
        self, glyphName, transformation, location, identifier=None, **kwargs
    ):
        from .classes import Component

        transformation = copy(transformation)
        self.components.append(Component(glyphName, transformation, location))


_pointToSegmentType = {
    PointType.OFF_CURVE_CUBIC: "curve",
    PointType.OFF_CURVE_QUAD: "qcurve",
}


def pairwise(iterable):
    it = iter(iterable)
    return zip(it, it)


def _iterPoints(coordinates, pointTypes, startIndex, endIndex):
    for i in range(startIndex, endIndex):
        point = dict(x=coordinates[i * 2], y=coordinates[i * 2 + 1])
        pointType = pointTypes[i]
        if pointType == PointType.OFF_CURVE_CUBIC:
            point["type"] = "cubic"
        elif pointType == PointType.OFF_CURVE_QUAD:
            point["type"] = "quad"
        elif pointType == PointType.ON_CURVE_SMOOTH:
            point["smooth"] = True
        yield point


def _packContour(unpackedContour):
    coordinates = []
    pointTypes = []
    for point in unpackedContour["points"]:
        coordinates.append(point["x"])
        coordinates.append(point["y"])
        pointTypes.append(packPointType(point.get("type"), point.get("smooth")))
    return dict(
        coordinates=coordinates,
        pointTypes=pointTypes,
        isClosed=unpackedContour["isClosed"],
    )


def packPointType(type, smooth):
    if type:
        pointType = (
            PointType.OFF_CURVE_CUBIC if type == "cubic" else PointType.OFF_CURVE_QUAD
        )
    elif smooth:
        pointType = PointType.ON_CURVE_SMOOTH
    else:
        pointType = PointType.ON_CURVE
    return pointType


#
# 1. A conceptual hack making an empty Path equal an empty PackedPath, so that
# cattrs can know to omit an empty path for a Union[PackedPath, Path] field,
# regardless of the actual path type.
# 2. A technical hack because we can't just override __eq__ as it is *generated*
# by @dataclass, and we want to use its implementation in all other cases.
#
def _add_eq_override(cls):
    original_eq = cls.__eq__

    def __eq__(self, other):
        if hasattr(other, "isEmpty") and self.isEmpty() and other.isEmpty():
            return True
        return original_eq(self, other)

    cls.__eq__ = __eq__


_add_eq_override(Path)
_add_eq_override(PackedPath)
