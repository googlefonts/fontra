from rcjktools.project import RoboCJKProject
from .pen import PathBuilderPointPen


class RCJKBackend:
    def __init__(self, path):
        self.project = RoboCJKProject(path)
        self.glyphNames = set()
        for gs in self._iterGlyphSets():
            self.glyphNames.update(gs.getGlyphNamesAndUnicodes())

    def _iterGlyphSets(self):
        yield self.project.characterGlyphGlyphSet
        yield self.project.deepComponentGlyphSet
        yield self.project.atomicElementGlyphSet

    async def getGlyphNames(self):
        return self.glyphNames

    async def getGlyph(self, glyphName):
        for gs in self._iterGlyphSets():
            if glyphName in gs:
                return unpackGlyph(gs.getGlyph(glyphName))
        else:
            return None


def unpackGlyph(glyph):
    d = {}
    d["axes"] = [
        dict(name=name, minValue=minValue, defaultValue=defaultValue, maxValue=maxValue)
        for name, (minValue, defaultValue, maxValue) in glyph.axes.items()
    ]
    d["name"] = glyph.name
    d["unicodes"] = glyph.unicodes
    sources = []
    for varGlyph in [glyph] + glyph.variations:
        source = {}
        source["location"] = varGlyph.location
        sourceGlyph = {}
        path = unpackPath(varGlyph)
        if path is not None:
            sourceGlyph["path"] = path
        components = unpackComponents(varGlyph.components)
        if components:
            sourceGlyph["components"] = components
        # TODO anchors?
        sourceGlyph["hAdvance"] = varGlyph.width  # TODO: vAdvance, verticalOrigin
        source["source"] = sourceGlyph
        sources.append(source)
    d["sources"] = sources
    return d


def unpackPath(glyph):
    pen = PathBuilderPointPen()
    glyph.drawPoints(pen)
    assert not pen.components
    return pen.getPath()


def unpackComponents(components):
    return [
        dict(name=compo.name, transform=compo.transform, coord=compo.coord)
        for compo in components
    ]
