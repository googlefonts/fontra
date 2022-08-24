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
        self.cmap = self.font.getBestCmap()
        revCmap = defaultdict(list)
        for code, glyphName in self.cmap.items():
            revCmap[glyphName].append(code)
        self.revCmap = dict(revCmap)
        self.glyphSet = self.font.getGlyphSet()
        return self

    def close(self):
        pass

    async def getReverseCmap(self):
        return self.revCmap

    def hasGlyph(self, glyphName):
        return glyphName in self.glyphSet

    async def getGlyph(self, glyphName):
        layerName = "<default>"
        glyph = {"name": glyphName}
        glyphDict = serializeGlyph(self.glyphSet, glyphName)
        layers = [{"name": layerName, "glyph": glyphDict}]
        glyph["sources"] = [
            {
                "location": {},
                "layerName": layerName,
            }
        ]
        glyph["unicodes"] = self.revCmap.get(glyphName, [])
        glyph["layers"] = layers
        return glyph

    async def getGlobalAxes(self):
        return []

    async def getFontLib(self):
        return []


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
