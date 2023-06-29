import pathlib

from fontTools.misc.roundTools import otRound
from fontTools.pens.pointPen import PointToSegmentPen
from fontTools.pens.recordingPen import RecordingPointPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.ufoLib import UFOReader


class Glyph:
    def __init__(self):
        self.pen = RecordingPointPen()

    def getPointPen(self):
        return self.pen

    def draw(self, pen):
        self.drawPoints(PointToSegmentPen(pen))

    def drawPoints(self, pen):
        self.pen.replay(pen)


class GlyphSet:
    def __init__(self, ufoGlyphSet):
        self.ufoGlyphSet = ufoGlyphSet

    def keys(self):
        return self.ufoGlyphSet.keys()

    def __getitem__(self, glyphName):
        glyph = Glyph()
        self.ufoGlyphSet.readGlyph(glyphName, glyph, glyph.getPointPen())
        return glyph


def numToString(number):
    return str(otRound(number))


def makeSVG(pathString, width, height, yMax):
    return (
        f"""<svg xmlns="http://www.w3.org/2000/svg" """
        f"""width="{width}" height="{height}" """
        f"""viewBox="0 0 {width} {height}">"""
        f"""<path transform="matrix(1 0 0 -1 0 {yMax})" """
        f"""d="{pathString}"/></svg>\n"""
    )


thisDir = pathlib.Path(__file__).resolve().parent
ufoPath = thisDir / "fontra-icons.ufo"
imagesDir = thisDir.parent / "src" / "fontra" / "client" / "images"

reader = UFOReader(ufoPath)

glyphSet = GlyphSet(reader.getGlyphSet())

iconNames = sorted(
    glyphName
    for glyphName in glyphSet.keys()
    if glyphName != "space" and glyphName[0] not in "._" and len(glyphName) > 1
)

for iconName in iconNames:
    pen = SVGPathPen(glyphSet, numToString)
    glyph = glyphSet[iconName]
    glyph.draw(pen)
    svgPath = pen.getCommands()
    iconPath = imagesDir / f"{iconName}.svg"
    iconPath.write_text(makeSVG(svgPath, glyph.width, 1000, 800))
