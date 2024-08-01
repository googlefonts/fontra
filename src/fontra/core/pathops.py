import pathops
from fontTools.pens.pointPen import (
    GuessSmoothPointPen,
    PointToSegmentPen,
    SegmentToPointPen,
)

from .path import PackedPathPointPen


def skiaPathOperations(pathA, pathB, pathOperation):
    skiaPathA = pathops.Path()
    pathA.drawPoints(PointToSegmentPen(skiaPathA.getPen()))

    skiaPathB = pathops.Path()
    pathB.drawPoints(PointToSegmentPen(skiaPathB.getPen()))

    builder = pathops.OpBuilder()
    builder.add(skiaPathA, pathops.PathOp.UNION)
    builder.add(skiaPathB, pathOperation)
    skiaPath = builder.resolve()

    pen = PackedPathPointPen()
    skiaPath.draw(SegmentToPointPen(GuessSmoothPointPen(pen)))

    return pen.getPath()


def unionPath(path):
    skiaPath = pathops.Path()
    path.drawPoints(PointToSegmentPen(skiaPath.getPen()))

    skiaPathSimplifed = pathops.simplify(skiaPath, clockwise=skiaPath.clockwise)

    pen = PackedPathPointPen()
    skiaPathSimplifed.draw(SegmentToPointPen(GuessSmoothPointPen(pen)))

    return pen.getPath()


def subtractPath(pathA, pathB):
    return skiaPathOperations(pathA, pathB, pathops.PathOp.REVERSE_DIFFERENCE)


def intersectPath(pathA, pathB):
    return skiaPathOperations(pathA, pathB, pathops.PathOp.INTERSECTION)


def excludePath(pathA, pathB):
    return skiaPathOperations(pathA, pathB, pathops.PathOp.XOR)
