import pathops

from . import clipboard, glyphnames
from .classes import unstructure

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


def skiaPathFromFontraPath(fontraPath: str) -> pathops.Path:
    path = pathops.Path()
    return path


def fontraPathFromSkiaPath(skiaPath: pathops.Path) -> str:
    # path = pathops.Path()
    return "fontraPathFromSkiaPath"


@api
def unionPath(pathA, pathB=None):
    skPathA = skiaPathFromFontraPath(pathA)
    if pathB is not None:
        skPathB = skiaPathFromFontraPath(pathB)
        skPathA.union(skPathB)
    print("python unionPath: ", pathA)
    return pathops.simplify(skPathA, clockwise=skPathA.clockwise)
