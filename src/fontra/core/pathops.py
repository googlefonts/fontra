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

    skiaPath = pathops.op(
        skiaPathA,
        skiaPathB,
        pathOperation,
        fix_winding=True,
        keep_starting_points=True,
        clockwise=False,
    )

    return skiaPathToFontraPath(skiaPath)


def unionPath(path):
    skiaPath = fontraPathToSkiaPath(path)
    skiaPathSimplifed = pathops.simplify(skiaPath, clockwise=skiaPath.clockwise)

    return skiaPathToFontraPath(skiaPathSimplifed)


def subtractPath(pathA, pathB):
    return skiaPathOperations(pathA, pathB, pathops.PathOp.DIFFERENCE)


def intersectPath(pathA, pathB):
    return skiaPathOperations(pathA, pathB, pathops.PathOp.INTERSECTION)


def excludePath(pathA, pathB):
    return skiaPathOperations(pathA, pathB, pathops.PathOp.XOR)
