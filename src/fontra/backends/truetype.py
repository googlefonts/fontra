from collections import defaultdict
from fontTools.pens.pointPen import SegmentToPointPen
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
        revCmap = defaultdict(list)
        for code, glyphName in self.cmap.items():
            revCmap[glyphName].append(code)
        self.revCmap = dict(revCmap)
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
        sources = [{"location": {}, "name": defaultLayerName, "layerName": defaultLayerName}]
        for variation in self.variations.get(glyphName, []):
            loc = {k: v[1] for k, v in variation.axes.items()}
            locStr = locationToString(loc)
            varGlyphSet = self.variationGlyphSets.get(locStr)
            if varGlyphSet is None:
                varGlyphSet = self.font.getGlyphSet(location=loc, normalized=True)
                self.variationGlyphSets[locStr] = varGlyphSet
            varGlyphDict = serializeGlyph(varGlyphSet, glyphName)
            layers.append({"name": locStr, "glyph": varGlyphDict})
            sources.append({"location": loc, "name": locStr, "layerName": locStr})
        glyph["unicodes"] = self.revCmap.get(glyphName, [])
        glyph["layers"] = layers
        glyph["sources"] = sources
        return glyph

    async def getGlobalAxes(self):
        return self.globalAxes

    async def getFontLib(self):
        return []


def unpackAxes(font):
    fvar = font.get("fvar")
    if fvar is None:
        return []
    axisList = []
    for axis in fvar.axes:
        axisDict = {
            "minValue": axis.minValue,
            "defaultValue": axis.defaultValue,
            "maxValue": axis.maxValue,
            "name": axis.axisTag,
        }
        normMin = -1 if axis.minValue < axis.defaultValue else 0
        normMax = 1 if axis.maxValue > axis.defaultValue else 0
        # TODO: add avar mapping
        axisDict["mapping"] = [
            (axis.minValue, normMin),
            (axis.defaultValue, 0),
            (axis.maxValue, normMax),
        ]
        axisList.append(axisDict)
    return axisList


def serializeGlyph(glyphSet, glyphName):
    pen = PathBuilderPointPen()
    ttGlyph = glyphSet[glyphName]
    ttGlyph.draw(SegmentToPointPen(pen))
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
        iv = int(v)
        if iv == v:
            v = iv
        parts.append(f"{k}={v}")
    return ",".join(parts)
