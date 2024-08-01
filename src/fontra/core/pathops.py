import pathops
from fontTools.pens.pointPen import (
    GuessSmoothPointPen,
    PointToSegmentPen,
    SegmentToPointPen,
)

from .classes import structure, unstructure
from .path import PackedPath, PackedPathPointPen


def skiaPathOperations(pathA, pathB, pathOperation):
    fontraPathA = structure(pathA, PackedPath)
    skiaPathA = pathops.Path()
    fontraPathA.drawPoints(PointToSegmentPen(skiaPathA.getPen()))

    fontraPathB = structure(pathB, PackedPath)
    skiaPathB = pathops.Path()
    fontraPathB.drawPoints(PointToSegmentPen(skiaPathB.getPen()))

    builder = pathops.OpBuilder()
    builder.add(skiaPathA, pathops.PathOp.UNION)
    builder.add(skiaPathB, pathOperation)
    skiaPath = builder.resolve()

    pen = PackedPathPointPen()
    skiaPath.draw(SegmentToPointPen(GuessSmoothPointPen(pen)))

    return unstructure(pen.getPath())


def unionPath(path):
    fontraPath = structure(path, PackedPath)
    skiaPath = pathops.Path()
    fontraPath.drawPoints(PointToSegmentPen(skiaPath.getPen()))

    skiaPathSimplifed = pathops.simplify(skiaPath, clockwise=skiaPath.clockwise)

    pen = PackedPathPointPen()
    skiaPathSimplifed.draw(SegmentToPointPen(GuessSmoothPointPen(pen)))

    return unstructure(pen.getPath())


def subtractPath(pathA, pathB):
    return skiaPathOperations(pathA, pathB, pathops.PathOp.REVERSE_DIFFERENCE)


def intersectPath(pathA, pathB):
    return skiaPathOperations(pathA, pathB, pathops.PathOp.INTERSECTION)


def excludePath(pathA, pathB):
    return skiaPathOperations(pathA, pathB, pathops.PathOp.XOR)
