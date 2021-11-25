from rcjktools.project import RoboCJKProject
from .pen import PathBuilderPointPen


class RCJKBackend:
    def __init__(self, path):
        self.project = RoboCJKProject(path)
        self.glyphNames = set()
        for gs in self._iterGlyphSets():
            self.glyphNames.update(gs.getGlyphNamesAndUnicodes())
        self.glyphNames = sorted(self.glyphNames)

    def _iterGlyphSets(self):
        yield self.project.characterGlyphGlyphSet
        yield self.project.deepComponentGlyphSet
        yield self.project.atomicElementGlyphSet

    async def getGlyphNames(self):
        return self.glyphNames

    async def getGlyph(self, glyphName):
        glyph = self._getRCJKGlyph(glyphName)
        if glyph is not None:
            ensureComponentCoords(glyph, self._getRCJKGlyph)
            glyph = unpackGlyph(glyph)
        return glyph

    def _getRCJKGlyph(self, glyphName):
        if not glyphName:
            return None
        for gs in self._iterGlyphSets():
            if glyphName in gs:
                return gs.getGlyph(glyphName)
        else:
            return None


def ensureComponentCoords(glyph, getGlyphFunc):
    if getattr(glyph, "_ensuredComponentCoords", False):
        return

    for compoIndex, compo in enumerate(glyph.components):
        compoGlyph = getGlyphFunc(compo.name)
        if compoGlyph is None:
            print(f"can't find component base glyph {compo.name}")
            continue

        allAxisNames = {
            axisName
            for g in [glyph] + glyph.variations
            for axisName in g.components[compoIndex].coord
        }
        allAxisNames |= set(compoGlyph.axes)
        for axisName in sorted(allAxisNames):
            defaultValue = compoGlyph.axes.get(axisName, (0, 0, 0))[1]
            for g in [glyph] + glyph.variations:
                axisValue = g.components[compoIndex].coord.get(axisName)
                if axisValue is None:
                    g.components[compoIndex].coord[axisName] = defaultValue

    glyph._ensuredComponentCoords = True


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
