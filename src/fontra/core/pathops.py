import pathops
from fontTools.pens.pointPen import (
    GuessSmoothPointPen,
    PointToSegmentPen,
    SegmentToPointPen,
)

from .path import PackedPathPointPen


def skiaPathToFontraPath(skiaPath):
    pen = PackedPathPointPen()
    skiaPath.draw(SegmentToPointPen(GuessSmoothPointPen(pen)))

    return pen.getPath()


def fontraPathToSkiaPath(fontraPath):
    skiaPath = pathops.Path()
    fontraPath.drawPoints(PointToSegmentPen(skiaPath.getPen()))

    return skiaPath


def skiaPathOperations(pathA, pathB, pathOperation):
    skiaPathA = fontraPathToSkiaPath(pathA)
    skiaPathB = fontraPathToSkiaPath(pathB)

    builder = pathops.OpBuilder()
    builder.add(skiaPathB, pathops.PathOp.UNION)
    builder.add(skiaPathA, pathOperation)
    skiaPath = builder.resolve()

    return skiaPathToFontraPath(skiaPath)


def unionPath(path):
    skiaPath = fontraPathToSkiaPath(path)
    skiaPathSimplifed = pathops.simplify(skiaPath, clockwise=skiaPath.clockwise)

    return skiaPathToFontraPath(skiaPathSimplifed)


def subtractPath(pathA, pathB):
    return skiaPathOperations(pathA, pathB, pathops.PathOp.REVERSE_DIFFERENCE)


def intersectPath(pathA, pathB):
    return skiaPathOperations(pathA, pathB, pathops.PathOp.INTERSECTION)


def excludePath(pathA, pathB):
    return skiaPathOperations(pathA, pathB, pathops.PathOp.XOR)
