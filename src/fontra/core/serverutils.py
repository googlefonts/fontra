from . import clipboard, glyphnames, unicode
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
def unicodeDecompose(codePoint: int) -> list[int]:
    return unicode.decompose(codePoint)


@api
def unicodeUsedBy(codePoint: int) -> list[int]:
    return unicode.usedBy(codePoint)
