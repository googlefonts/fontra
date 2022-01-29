import math
from rcjktools.utils import decomposeTwoByTwo


ON_CURVE = 0x00
OFF_CURVE_QUAD = 0x01
OFF_CURVE_CUBIC = 0x02
SMOOTH_FLAG = 0x08
POINT_TYPE_MASK = 0x07


class PathBuilderPointPen:
    def __init__(self):
        self.coordinates = []
        self.pointTypes = []
        self.contours = []
        self.components = []
        self._currentContour = None

    def getPath(self):
        if self.coordinates:
            return dict(
                coordinates=self.coordinates,
                pointTypes=self.pointTypes,
                contours=self.contours,
            )
        else:
            return None

    def beginPath(self, **kwargs):
        self._currentContour = []

    def addPoint(self, pt, segmentType, smooth=False, *args, **kwargs):
        self._currentContour.append((pt, segmentType, smooth))

    def endPath(self):
        if not self._currentContour:
            return
        isClosed = self._currentContour[0][0] != "move"
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
        self.contours.append(
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
        assert abs(skewx) < 0.00001, f"x skew is not yet supported ({self.name})"
        assert abs(skewy) < 0.00001, f"y skew is not yet supported ({self.name})"
        transform = dict(
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
                "transform": transform,
            }
        )
