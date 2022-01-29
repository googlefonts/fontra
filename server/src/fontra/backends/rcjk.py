from rcjktools.project import RoboCJKProject
from .pen import PathBuilderPointPen


class RCJKBackend:
    @classmethod
    def fromPath(cls, path):
        self = cls()
        self.project = RoboCJKProject(path)
        self.reversedCmap = {}
        for gs, hasEncoding in self._iterGlyphSets():
            reversedCmap = gs.getGlyphNamesAndUnicodes()
            for glyphName, unicodes in reversedCmap.items():
                assert glyphName not in self.reversedCmap
                self.reversedCmap[glyphName] = unicodes if hasEncoding else []
        self.glyphNames = sorted(self.reversedCmap)
        return self

    def _iterGlyphSets(self):
        yield self.project.characterGlyphGlyphSet, True
        yield self.project.deepComponentGlyphSet, False
        yield self.project.atomicElementGlyphSet, False

    async def getGlyphNames(self):
        return self.glyphNames

    async def getReversedCmap(self):
        return self.reversedCmap

    async def getGlyph(self, glyphName):
        glyph = self._getRCJKGlyph(glyphName)
        if glyph is not None:
            ensureComponentCoords(glyph, self._getRCJKGlyph)
            glyph = serializeGlyph(glyph)
        return glyph

    async def getGlobalAxes(self):
        axes = self.project.designspace["axes"]
        for axis in axes:
            axis["label"] = axis["name"]
            axis["name"] = axis["tag"]
            del axis["tag"]
        return axes

    def _getRCJKGlyph(self, glyphName):
        if not glyphName:
            return None
        for gs, _ in self._iterGlyphSets():
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


def serializeGlyph(glyph):
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
        sourceName = getattr(varGlyph, "sourceName", "<default>")
        if not sourceName and varGlyph.layerName:
            sourceName = f"{varGlyph.layerName}"
        source["name"] = sourceName
        source["location"] = varGlyph.location
        sourceGlyph = {}
        path = serializePath(varGlyph)
        if path is not None:
            sourceGlyph["path"] = path
        components = serializeComponents(varGlyph.components)
        if components:
            sourceGlyph["components"] = components
        # TODO anchors?
        sourceGlyph["xAdvance"] = varGlyph.width  # TODO: yAdvance, verticalOrigin
        source["source"] = sourceGlyph
        sources.append(source)
    d["sources"] = sources
    return d


def serializePath(glyph):
    pen = PathBuilderPointPen()
    glyph.drawPoints(pen)
    assert not pen.components
    return pen.getPath()


def serializeComponents(components):
    return [
        dict(name=compo.name, transform=compo.transform, location=compo.coord)
        for compo in components
    ]
