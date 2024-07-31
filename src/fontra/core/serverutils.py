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

    simplifySkiaPath = pathops.simplify(skiaPath, clockwise=skiaPath.clockwise)

    pen = PackedPathPointPen()
    simplifySkiaPath.draw(SegmentToPointPen(GuessSmoothPointPen(pen)))

    return unstructure(pen.getPath())

