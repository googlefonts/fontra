from glyphsLib.glyphdata import GlyphData


GLYPHDATA = None


def _getGlyphData():
    global GLYPHDATA
    if GLYPHDATA is None:
        from importlib.resources import open_binary

        with open_binary("glyphsLib.data", "GlyphData.xml") as f1:
            GLYPHDATA = GlyphData.from_files(f1)
    return GLYPHDATA


def getSuggestedGlyphName(codePoint):
    data = _getGlyphData()
    uniStr = f"{codePoint:04X}"
    info = data.unicodes.get(uniStr)
    if info is not None:
        return info["name"]
    return "uni" + uniStr if len(uniStr) == 4 else "u" + uniStr
