import logging
from copy import copy
from dataclasses import dataclass, field
from enum import IntEnum
from typing import Optional, TypedDict

import cattrs
from fontTools.misc.transform import DecomposedTransform

logger = logging.getLogger(__name__)


# Path, aka "unpacked path", but structured


class Point(TypedDict):
    x: float
    y: float
    type: Optional[str]
    smooth: Optional[bool] = False


@dataclass
class Contour:
    points: list[Point] = field(default_factory=list)
    isClosed: bool = False


@dataclass
class Path:
    contours: list[Contour] = field(default_factory=list)

    def asPackedPath(self):
        return PackedPath.fromUnpackedContours(cattrs.unstructure(self.contours))


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
        return Path(contours=cattrs.structure(self.unpackedContours(), list[Contour]))

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
