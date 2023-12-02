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
def getUnicodeFromGlyphName(glyphName):
    return glyphnames.getUnicodeFromGlyphName(glyphName)


@api
def parseClipboard(data):
    return unstructure(clipboard.parseClipboard(data))
