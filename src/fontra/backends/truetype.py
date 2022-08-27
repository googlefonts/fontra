from fontTools.pens.pointPen import GuessSmoothPointPen
from fontTools.ttLib import TTFont
from .pen import PathBuilderPointPen


class TTFBackend:
    @classmethod
    def fromPath(cls, path):
        self = cls()
        self.path = path
        self.font = TTFont(path, lazy=True)
        self.globalAxes = unpackAxes(self.font)
        gvar = self.font.get("gvar")
        self.variations = gvar.variations if gvar is not None else {}
        self.cmap = self.font.getBestCmap()
        revCmap = {}
        for glyphName in self.font.getGlyphOrder():
            revCmap[glyphName] = []
        for code, glyphName in sorted(self.cmap.items()):
            revCmap[glyphName].append(code)
        self.revCmap = revCmap
        self.glyphSet = self.font.getGlyphSet()
        self.variationGlyphSets = {}
        return self

    def close(self):
        pass

    async def getReverseCmap(self):
        return self.revCmap

    def hasGlyph(self, glyphName):
        return glyphName in self.glyphSet

    async def getGlyph(self, glyphName):
        defaultLayerName = "<default>"
        glyph = {"name": glyphName}
        glyphDict = serializeGlyph(self.glyphSet, glyphName)
        layers = [{"name": defaultLayerName, "glyph": glyphDict}]
        defaultLocation = {axis["name"]: 0 for axis in self.globalAxes}
        sources = [
            {
                "location": defaultLocation,
                "name": defaultLayerName,
                "layerName": defaultLayerName,
            }
        ]
        for variation in self._getGlyphVariationLocations(glyphName):
            sparseLoc = {k: v[1] for k, v in variation.axes.items()}
            fullLoc = defaultLocation.copy()
            fullLoc.update(sparseLoc)
            locStr = locationToString(sparseLoc)
            varGlyphSet = self.variationGlyphSets.get(locStr)
            if varGlyphSet is None:
                varGlyphSet = self.font.getGlyphSet(location=fullLoc, normalized=True)
                self.variationGlyphSets[locStr] = varGlyphSet
            varGlyphDict = serializeGlyph(varGlyphSet, glyphName)
            layers.append({"name": locStr, "glyph": varGlyphDict})
            sources.append({"location": fullLoc, "name": locStr, "layerName": locStr})
        glyph["unicodes"] = self.revCmap.get(glyphName, [])
        glyph["layers"] = layers
        glyph["sources"] = sources
        return glyph

    def _getGlyphVariationLocations(self, glyphName):
        # TODO/FIXME: This misses variations that only exist in HVAR/VVAR
        # TODO/FIXME: this needs to be updated for CFF2
        return self.variations.get(glyphName, [])

    async def getGlobalAxes(self):
        return self.globalAxes

    async def getFontLib(self):
        return []


def unpackAxes(font):
    fvar = font.get("fvar")
    if fvar is None:
        return []
    avar = font.get("avar")
    avarMapping = (
        {k: sorted(v.items()) for k, v in avar.segments.items()}
        if avar is not None
        else {}
    )
    axisList = []
    for axis in fvar.axes:
        normMin = -1 if axis.minValue < axis.defaultValue else 0
        normMax = 1 if axis.maxValue > axis.defaultValue else 0
        posExtent = axis.maxValue - axis.defaultValue
        negExtent = axis.defaultValue - axis.minValue
        mapping = avarMapping.get(axis.axisTag, [])
        if mapping:
            mapping = [
                (
                    axis.defaultValue
                    + (inValue * posExtent if inValue >= 0 else inValue * negExtent),
                    outValue,
                )
                for inValue, outValue in mapping
                if normMin <= outValue <= normMax
            ]
        else:
            mapping = [
                (axis.minValue, normMin),
                (axis.defaultValue, 0),
                (axis.maxValue, normMax),
            ]
        axisList.append(
            {
                "minValue": axis.minValue,
                "defaultValue": axis.defaultValue,
                "maxValue": axis.maxValue,
                "name": axis.axisTag,
                "mapping": mapping,
            }
        )
    return axisList


def serializeGlyph(glyphSet, glyphName):
    pen = PathBuilderPointPen()
    ttGlyph = glyphSet[glyphName]
    ttGlyph.drawPoints(GuessSmoothPointPen(pen))
    path = pen.getPath()
    glyphDict = {}
    if path is not None:
        glyphDict["path"] = path
    if pen.components:
        glyphDict["components"] = pen.components
    glyphDict["xAdvance"] = ttGlyph.width
    # TODO: yAdvance, verticalOrigin
    return glyphDict


def locationToString(loc):
    parts = []
    for k, v in sorted(loc.items()):
        v = round(v, 5)  # enough to differentiate all 2.14 fixed values
        iv = int(v)
        if iv == v:
            v = iv
        parts.append(f"{k}={v}")
    return ",".join(parts)
