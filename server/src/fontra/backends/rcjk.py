from rcjktools.project import RoboCJKProject


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
            raise KeyError(glyphName)


def unpackGlyph(glyph):
    d = {}
    d["axes"] = glyph.axes
    d["name"] = glyph.name
    d["unicodes"] = glyph.unicodes
    sources = []
    for varGlyph in [glyph] + glyph.variations:
        source = {}
        source["location"] = varGlyph.location
        sourceGlyph = {}
        sourceGlyph["path"] = unpackPath(varGlyph)
        sourceGlyph["components"] = unpackComponents(varGlyph.components)
        # TODO anchors?
        sourceGlyph["xAdvance"] = varGlyph.width  # TODO: yAdvance, verticalOrigin
        source["source"] = sourceGlyph
        sources.append(source)
    d["sources"] = sources
    return d


def unpackPath(glyph):
    pen = UnpackPointPen()
    glyph.drawPoints(pen)
    return pen.getPath()


def unpackComponents(components):
    return [
        dict(name=compo.name, transform=compo.transform, coord=compo.coord)
        for compo in components
    ]


ON_CURVE = 0x00
OFF_CURVE_QUAD = 0x01
OFF_CURVE_CUBIC = 0x02
SMOOTH_FLAG = 0x08
POINT_TYPE_MASK = 0x07


class UnpackPointPen:
    def __init__(self):
        self.coordinates = []
        self.pointTypes = []
        self.contours = []
        self._currentContour = None

    def getPath(self):
        return dict(
            coordinates=self.coordinates,
            pointTypes=self.pointTypes,
            contours=self.contours,
        )

    def beginPath(self):
        self._currentContour = []

    def addPoint(self, pt, segmentType, smooth=False, *args, **kwargs):
        self._currentContour.append((pt, segmentType, smooth))

    def endPath(self):
        if not self._currentContour:
            return
        isClosed = self._currentContour[0][0] != "move"
        isQuadBlob = all(
            segmentType is None for _, segmentType, _ in self._currentContour
        )
        if isQuadBlob:
            self.pointTypes.extend([OFF_CURVE_QUAD] * len(self._currentContour))
            for pt, _, _ in self._currentContour:
                self.coordinates.extend(pt)
        else:
            pointTypes = []
            for pt, segmentType, smooth in self._currentContour:
                smoothFlag = SMOOTH_FLAG if smooth else 0x00
                if segmentType is None:
                    pointTypes.append(OFF_CURVE_CUBIC)
                elif segmentType in {"move", "line", "curve", "qcurve"}:
                    pointTypes.append(ON_CURVE | smoothFlag)
                else:
                    raise TypeError(f"unexpected segment type: {segmentType}")

                self.coordinates.extend(pt)
            assert len(pointTypes) == len(self._currentContour)
            # Fix the quad point types
            for i, (_, segmentType, _) in enumerate(self._currentContour):
                if segmentType == "qcurve":
                    stopIndex = i - len(pointTypes) if isClosed else -1
                    for j in range(i - 1, stopIndex, -1):
                        if pointTypes[j] != OFF_CURVE_CUBIC:
                            break
                        pointTypes[j] = OFF_CURVE_QUAD
            self.pointTypes.extend(pointTypes)
        self.contours.append(
            dict(endPoint=len(self.coordinates) // 2 - 1, isClosed=isClosed)
        )
        self._currentContour = None

    def addComponent(self, *args, **kwargs):
        pass
