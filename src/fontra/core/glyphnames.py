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


def getUnicodeFromGlyphName(glyphName):
    data = _getGlyphData()

    info = data.names.get(glyphName)

    codePoint = None
    if info is not None:
        codePoint = int(info["unicode"], 16)
    elif glyphName.startswith("uni"):
        uniStr = glyphName[3:]
        if 4 <= len(uniStr) <= 5 and uniStr.upper() == uniStr:
            try:
                codePoint = int(uniStr, 16)
            except ValueError:
                pass
    elif glyphName.startswith("u"):
        uniStr = glyphName[1:]
        if 5 <= len(uniStr) <= 6 and uniStr.upper() == uniStr:
            try:
                codePoint = int(uniStr, 16)
            except ValueError:
                pass
            if codePoint > 0x10FFFF:
                codePoint = None

    return codePoint
