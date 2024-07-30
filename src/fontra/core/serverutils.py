import pathops

from . import clipboard, glyphnames

# from fontTools.ttLib import removeOverlaps
from .classes import StaticGlyph, unstructure
from .path import Contour, Path

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


# I have the feeling that I am overcomplicating things here, but even if not,
# the following code should likely be moved to a different location.
def skiaPathFromStaticGlyph(
    staticGlyph: StaticGlyph, contourIndices: list
) -> pathops.Path:
    builder = pathops.OpBuilder()
    for i, contour in enumerate(staticGlyph.path.asPath().contours):
        if len(contourIndices) > 0 and i not in contourIndices:
            continue
        if not contour.isClosed:
            continue
        points = contour.points
        path = pathops.Path()
        pen = path.getPen()
        p1 = points[0]
        pen.moveTo((p1["x"], p1["y"]))
        skip = []
        for i, point in enumerate(points):
            if i in skip:
                continue
            if "type" not in point:
                pen.lineTo((point["x"], point["y"]))
            else:
                pen.curveTo(
                    (point["x"], point["y"]),
                    (points[i + 1]["x"], points[i + 1]["y"]),
                    (points[i + 2]["x"], points[i + 2]["y"]),
                )
                skip.extend([i + 1, i + 2])
        pen.endPath()
        builder.add(path, pathops.PathOp.UNION)

    return builder.resolve()


def staticGlyphContoursFromSkiaPath(skiaPath: pathops.Path) -> list:
    contours = []
    points = []
    for pointInfo in skiaPath:
        p = pointInfo[1]
        if pointInfo[0] == 4:
            points.append({"x": p[0][0], "y": p[0][1], "type": "cubic"})
            points.append({"x": p[1][0], "y": p[1][1], "type": "cubic"})
            points.append({"x": p[2][0], "y": p[2][1]})
        elif pointInfo[0] != 5:
            points.append({"x": p[0][0], "y": p[0][1]})
        else:
            contours.append(Contour(points=points, isClosed=True))
            points = []

    return contours


@api
def unionPath(data, contourIndices):
    staticGlyph = clipboard.parseClipboard(data)
    skiaPath = skiaPathFromStaticGlyph(staticGlyph, contourIndices)

    simplifyPath = pathops.simplify(skiaPath, clockwise=skiaPath.clockwise)
    contours = staticGlyphContoursFromSkiaPath(simplifyPath)
    staticGlyph.path = Path(contours=contours).asPackedPath()

    return unstructure(staticGlyph)

