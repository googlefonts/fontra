from fontTools.pens.boundsPen import ControlBoundsPen
from fontTools.pens.pointPen import (
    GuessSmoothPointPen,
    PointToSegmentPen,
    SegmentToPointPen,
)
from fontTools.svgLib import SVGPath
from fontTools.ufoLib.glifLib import readGlyphFromString

from .classes import StaticGlyph
from .packedpath import PackedPathPointPen


def parseClipboard(data):
    if "<svg " in data:
        return parseSVG(data)
    if "<?xml" in data and "<glyph " in data:
        return parseGLIF(data)
    return None


def parseSVG(data):
    svgPath = SVGPath.fromstring(data)
    pen = PackedPathPointPen()
    svgPath.draw(SegmentToPointPen(GuessSmoothPointPen(pen)))
    path = pen.getPath()
    boundsPen = ControlBoundsPen(None)
    path.drawPoints(PointToSegmentPen(boundsPen))
    return StaticGlyph(path=path, xAdvance=boundsPen.bounds[2])


class UFOGlyph:
    width = 500


def parseGLIF(data):
    pen = PackedPathPointPen()
    ufoGlyph = UFOGlyph()
    readGlyphFromString(
        data,
        glyphObject=ufoGlyph,
        pointPen=pen,
    )
    return StaticGlyph(
        path=pen.getPath(), components=pen.components, xAdvance=ufoGlyph.width
    )
