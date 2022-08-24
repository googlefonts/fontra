import logging
import math


logger = logging.getLogger(__name__)


ON_CURVE = 0x00
OFF_CURVE_QUAD = 0x01
OFF_CURVE_CUBIC = 0x02
SMOOTH_FLAG = 0x08
POINT_TYPE_MASK = 0x07


class PathBuilderPointPen:
    def __init__(self):
        self.coordinates = []
        self.pointTypes = []
        self.contourInfo = []
        self.components = []
        self._currentContour = None

    def getPath(self):
        if self.coordinates:
            return dict(
                coordinates=self.coordinates,
                pointTypes=self.pointTypes,
                contourInfo=self.contourInfo,
            )
        else:
            return None

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
            self.pointTypes.extend([OFF_CURVE_QUAD] * len(self._currentContour))
            for pt, _, _ in self._currentContour:
                self.coordinates.extend(pt)
        else:
            pointTypes = []
            for pt, segmentType, smooth in self._currentContour:
                smoothFlag = SMOOTH_FLAG if smooth else 0x00
                if segmentType is None:
                    pointTypes.append(OFF_CURVE_CUBIC)
                elif segmentType in {"move", "line", "curve", "qcurve"}:
                    pointTypes.append(ON_CURVE | smoothFlag)
                else:
                    raise TypeError(f"unexpected segment type: {segmentType}")

                self.coordinates.extend(pt)
            assert len(pointTypes) == len(self._currentContour)
            # Fix the quad point types
            for i, (_, segmentType, _) in enumerate(self._currentContour):
                if segmentType == "qcurve":
                    stopIndex = i - len(pointTypes) if isClosed else -1
                    for j in range(i - 1, stopIndex, -1):
                        if pointTypes[j] != OFF_CURVE_CUBIC:
                            break
                        pointTypes[j] = OFF_CURVE_QUAD
            self.pointTypes.extend(pointTypes)
        self.contourInfo.append(
            dict(endPoint=len(self.coordinates) // 2 - 1, isClosed=isClosed)
        )
        self._currentContour = None

    def addComponent(self, glyphName, transformation, **kwargs):
        xx, xy, yx, yy, dx, dy = transformation
        rotation, scalex, scaley, skewx, skewy = decomposeTwoByTwo((xx, xy, yx, yy))
        # TODO rotation is problematic with interpolation: should interpolation
        # go clockwise or counter-clockwise? That ambiguous, and get more complicated
        # with > 2 masters. Perhaps we can "normalize" the rotations angles in some
        # way to have reasonable behavior in common cases.
        if rotation == -0.0:
            rotation = 0.0
        if abs(skewx) > 0.00001:
            logger.warn(f"x skew is not yet supported ({glyphName}, {skewx})")
        if abs(skewy) > 0.00001:
            logger.warn(f"y skew is not yet supported ({glyphName}, {skewy})")
        transformation = dict(
            x=dx,
            y=dy,
            scalex=scalex,
            scaley=scaley,
            rotation=math.degrees(rotation),
            tcenterx=0,
            tcentery=0,
        )

        self.components.append(
            {
                "name": glyphName,
                "transformation": transformation,
            }
        )


def decomposeTwoByTwo(twoByTwo):
    """Decompose a 2x2 transformation matrix into components:
    - rotation
    - scalex
    - scaley
    - skewx
    - skewy
    """
    a, b, c, d = twoByTwo
    delta = a * d - b * c

    rotation = 0
    scalex = scaley = 0
    skewx = skewy = 0

    # Apply the QR-like decomposition.
    if a != 0 or b != 0:
        r = math.sqrt(a * a + b * b)
        rotation = math.acos(a / r) if b > 0 else -math.acos(a / r)
        scalex, scaley = (r, delta / r)
        skewx, skewy = (math.atan((a * c + b * d) / (r * r)), 0)
    elif c != 0 or d != 0:
        s = math.sqrt(c * c + d * d)
        rotation = math.pi / 2 - (math.acos(-c / s) if d > 0 else -math.acos(c / s))
        scalex, scaley = (delta / s, s)
        skewx, skewy = (0, math.atan((a * c + b * d) / (s * s)))
    else:
        # a = b = c = d = 0
        pass

    return rotation, scalex, scaley, skewx, skewy


_pointToSegmentType = {
    OFF_CURVE_CUBIC: "curve",
    OFF_CURVE_QUAD: "qcurve",
}


def drawPathToPointPen(path, pen):
    startPoint = 0
    for contourInfo in path["contourInfo"]:
        endPoint = contourInfo["endPoint"] + 1
        coordinates = path["coordinates"][startPoint * 2 : endPoint * 2]
        points = list(pairwise(coordinates))
        pointTypes = path["pointTypes"][startPoint:endPoint]
        assert len(points) == len(pointTypes)
        pen.beginPath()
        segmentType = (
            _pointToSegmentType.get(pointTypes[-1] & POINT_TYPE_MASK, "line")
            if contourInfo["isClosed"]
            else "move"
        )
        for point, pointType in zip(points, pointTypes):
            isSmooth = bool(pointType & SMOOTH_FLAG)
            pointType = pointType & POINT_TYPE_MASK
            pen.addPoint(
                point,
                segmentType=segmentType if pointType == 0 else None,
                smooth=isSmooth,
            )
            segmentType = _pointToSegmentType.get(pointType, "line")
        pen.endPath()
        startPoint = endPoint


def pairwise(iterable):
    it = iter(iterable)
    return zip(it, it)
