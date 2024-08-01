import pathops
from fontTools.pens.pointPen import (
    GuessSmoothPointPen,
    PointToSegmentPen,
    SegmentToPointPen,
)

from . import clipboard, glyphnames
from .classes import structure, unstructure
from .path import PackedPath, PackedPathPointPen

apiFunctions = {}


def api(func):
    apiFunctions[func.__name__] = func
    return func


@api
def getSuggestedGlyphName(codePoint):
    return glyphnames.getSuggestedGlyphName(codePoint)


@api
def getCodePointFromGlyphName(glyphName):
    return glyphnames.getCodePointFromGlyphName(glyphName)


@api
def parseClipboard(data):
    return unstructure(clipboard.parseClipboard(data))


@api
def unionPath(path):
    fontraPath = structure(path, PackedPath)
    skiaPath = pathops.Path()
    fontraPath.drawPoints(PointToSegmentPen(skiaPath.getPen()))

    skiaPathSimplifed = pathops.simplify(skiaPath, clockwise=skiaPath.clockwise)

    pen = PackedPathPointPen()
    skiaPathSimplifed.draw(SegmentToPointPen(GuessSmoothPointPen(pen)))

    return unstructure(pen.getPath())


@api
def subtractPath(pathA, pathB):
    return skiaPathOperations(pathA, pathB, pathops.PathOp.REVERSE_DIFFERENCE)


@api
def intersectPath(pathA, pathB):
    return skiaPathOperations(pathA, pathB, pathops.PathOp.INTERSECTION)


@api
def excludePath(pathA, pathB):
    return skiaPathOperations(pathA, pathB, pathops.PathOp.DIFFERENCE)


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
