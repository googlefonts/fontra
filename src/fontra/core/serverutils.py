from . import clipboard, glyphnames, pathops
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


@api
def unionPath(path):
    return pathops.unionPath(path)


@api
def subtractPath(pathA, pathB):
    return pathops.subtractPath(pathA, pathB)


@api
def intersectPath(pathA, pathB):
    return pathops.intersectPath(pathA, pathB)


@api
def excludePath(pathA, pathB):
    return pathops.excludePath(pathA, pathB)
