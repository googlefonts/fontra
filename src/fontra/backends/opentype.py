from fontTools.misc.psCharStrings import SimpleT2Decompiler
from fontTools.pens.pointPen import GuessSmoothPointPen
from fontTools.ttLib import TTFont
from ..core.classes import VariableGlyph, StaticGlyph, Source, Layer
from ..core.packedpath import PackedPath, PackedPathPointPen


class OTFBackend:
    @classmethod
    def fromPath(cls, path):
        self = cls()
        self.path = path
        self.font = TTFont(path, lazy=True)
        self.globalAxes = unpackAxes(self.font)
        gvar = self.font.get("gvar")
        self.gvarVariations = gvar.variations if gvar is not None else None
        self.charStrings = (
            list(self.font["CFF2"].cff.values())[0].CharStrings
            if "CFF2" in self.font
            else None
        )
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

    async def getGlyphMap(self):
        return self.revCmap

    def hasGlyph(self, glyphName):
        return glyphName in self.glyphSet

    async def getGlyph(self, glyphName):
        defaultLayerName = "<default>"
        glyph = VariableGlyph(glyphName)
        staticGlyph = serializeGlyph(self.glyphSet, glyphName)
        layers = [Layer(name=defaultLayerName, glyph=staticGlyph)]
        defaultLocation = {axis["name"]: 0 for axis in self.globalAxes}
        sources = [
            Source(
                location=defaultLocation,
                name=defaultLayerName,
                layerName=defaultLayerName,
            )
        ]
        for sparseLoc in self._getGlyphVariationLocations(glyphName):
            fullLoc = defaultLocation | sparseLoc
            locStr = locationToString(sparseLoc)
            varGlyphSet = self.variationGlyphSets.get(locStr)
            if varGlyphSet is None:
                varGlyphSet = self.font.getGlyphSet(location=fullLoc, normalized=True)
                self.variationGlyphSets[locStr] = varGlyphSet
            varGlyph = serializeGlyph(varGlyphSet, glyphName)
            layers.append(Layer(name=locStr, glyph=varGlyph))
            sources.append(Source(location=fullLoc, name=locStr, layerName=locStr))
        if self.charStrings is not None:
            checkAndFixCFF2Compatibility(glyphName, layers)
        glyph.layers = layers
        glyph.sources = sources
        return glyph

    def _getGlyphVariationLocations(self, glyphName):
        # TODO/FIXME: This misses variations that only exist in HVAR/VVAR
        locations = set()
        if self.gvarVariations is not None:
            locations = {
                tuplifyLocation({k: v[1] for k, v in variation.axes.items()})
                for variation in self.gvarVariations.get(glyphName, [])
            }
        elif (
            self.charStrings is not None
            and glyphName in self.charStrings
            and getattr(self.charStrings, "varStore", None) is not None
        ):
            cs = self.charStrings[glyphName]
            subrs = getattr(cs.private, "Subrs", [])
            collector = VarIndexCollector(subrs, cs.globalSubrs, cs.private)
            collector.execute(cs)
            vsIndices = sorted(collector.vsIndices)
            fvarAxes = self.font["fvar"].axes
            varStore = self.charStrings.varStore.otVarStore
            locations = {
                tuplifyLocation(loc)
                for varDataIndex in vsIndices
                for loc in getLocationsFromVarstore(varDataIndex, varStore, fvarAxes)
            }
        return [dict(loc) for loc in sorted(locations)]

    async def getGlobalAxes(self):
        return self.globalAxes

    async def getUnitsPerEm(self):
        return self.font["head"].unitsPerEm

    async def getFontLib(self):
        return []


def tuplifyLocation(loc):
    return tuple(sorted(loc.items()))


def getLocationsFromVarstore(varDataIndex, varStore, fvarAxes):
    regions = varStore.VarRegionList.Region
    for regionIndex in varStore.VarData[varDataIndex].VarRegionIndex:
        location = {
            fvarAxes[i].axisTag: reg.PeakCoord
            for i, reg in enumerate(regions[regionIndex].VarRegionAxis)
            if reg.PeakCoord != 0
        }
        yield location


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
    pen = PackedPathPointPen()
    ttGlyph = glyphSet[glyphName]
    ttGlyph.drawPoints(GuessSmoothPointPen(pen))
    path = pen.getPath()
    staticGlyph = StaticGlyph()
    staticGlyph.path = path
    staticGlyph.components = pen.components
    staticGlyph.xAdvance = ttGlyph.width
    # TODO: yAdvance, verticalOrigin
    return staticGlyph


def locationToString(loc):
    parts = []
    for k, v in sorted(loc.items()):
        v = round(v, 5)  # enough to differentiate all 2.14 fixed values
        iv = int(v)
        if iv == v:
            v = iv
        parts.append(f"{k}={v}")
    return ",".join(parts)


class VarIndexCollector(SimpleT2Decompiler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.vsIndices = set()

    def op_blend(self, index):
        super().op_blend(index)
        self.vsIndices.add(self.vsIndex)


def checkAndFixCFF2Compatibility(glyphName, layers):
    #
    # https://github.com/fonttools/fonttools/issues/2838
    #
    # Via ttGlyphSet.py, we're using SegmentToPointPen to convert CFF/T2 segments
    # to points, which normally leads to closing curve-to points being removed.
    #
    # However, as the fonttools issue above shows, in some situations, it does
    # not close onto the starting point at *some* locations, due to rounding errors
    # in the source deltas.
    #
    # This functions detects those cases and compensates for it by appending the
    # starting point at the end of the contours that *do* close nicely.
    #
    # This is a somewhat ugly trade-off to keep interpolation compatibility.
    #
    firstPath = layers[0].glyph.path
    firstPointTypes = firstPath.pointTypes
    unpackedContourses = [None] * len(layers)
    contourLengths = None
    for layerIndex, layer in enumerate(layers):
        if layer.glyph.path.pointTypes != firstPointTypes:
            if contourLengths is None:
                unpackedContourses[0] = firstPath.unpackedContours()
                contourLengths = [len(c["points"]) for c in unpackedContourses[0]]
            unpackedContours = layer.glyph.path.unpackedContours()
            unpackedContourses[layerIndex] = unpackedContours
            assert len(contourLengths) == len(unpackedContours)
            contourLengths = [
                max(cl, len(unpackedContours[i]["points"]))
                for i, cl in enumerate(contourLengths)
            ]
    if contourLengths is None:
        # All good, nothing to do
        return
    for layerIndex, layer in enumerate(layers):
        if unpackedContourses[layerIndex] is None:
            unpackedContourses[layerIndex] = layer.glyph.path.unpackedContours()
        unpackedContours = unpackedContourses[layerIndex]
        for i, contourLength in enumerate(contourLengths):
            if len(unpackedContours[i]["points"]) + 1 == contourLength:
                firstPoint = unpackedContours[i]["points"][0]
                firstPoint["smooth"] = False
                unpackedContours[i]["points"].append(firstPoint)
        layer.glyph.path = PackedPath.fromUnpackedContours(unpackedContours)
