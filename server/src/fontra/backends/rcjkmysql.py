import asyncio
from fontTools.ufoLib.glifLib import readGlyphFromString
from .pen import PathBuilderPointPen


class RCJKMySQLBackend:
    @classmethod
    async def fromRCJKClient(cls, client, fontUID):
        self = cls()
        self.client = client
        self.fontUID = fontUID

        self._glyphMapping = None
        self._tempGlyphDataCache = {}
        self._tempGlyphDataCacheTimer = None
        self._tempGlyphDataCacheTimeout = 5
        return self

    async def getGlyphNames(self):
        return sorted(await self.getReverseCmap())

    async def getReverseCmap(self):
        self._glyphMapping = {}
        revCmap = {}
        for typeCode, methodName in _glyphListMethods.items():
            method = getattr(self.client, methodName)
            response = await method(self.fontUID)
            for glyphInfo in response["data"]:
                unicode_hex = glyphInfo.get("unicode_hex")
                if unicode_hex:
                    unicodes = [int(unicode_hex, 16)]
                else:
                    unicodes = []
                revCmap[glyphInfo["name"]] = unicodes
                self._glyphMapping[glyphInfo["name"]] = (typeCode, glyphInfo["id"])
        return revCmap

    async def getGlyph(self, glyphName):
        typeCode, glyphID = self._glyphMapping[glyphName]
        glyphData = self._tempGlyphDataCache.get((typeCode, glyphID))
        if glyphData is None:
            getMethodName = _getGlyphMethods[typeCode]
            method = getattr(self.client, getMethodName)
            response = await method(
                self.fontUID, glyphID, return_layers=True, return_related=True
            )
            glyphData = response["data"]
            self._tempGlyphDataCache[(typeCode, glyphID)] = glyphData

        self._cacheBaseGlyphData(glyphData.get("made_of", ()))
        axisDefaults = {}
        for baseGlyphDict in glyphData.get("made_of", ()):
            axisDefaults.update(extractAxisDefaults(baseGlyphDict))

        layers = {
            layer["group_name"]: layer["data"] for layer in glyphData.get("layers", ())
        }
        self._scheduleCachePurge()
        return serializeGlyph(glyphData["data"], layers, axisDefaults)

    async def getGlobalAxes(self):
        font_data = await self.client.font_get(self.fontUID)
        ds = font_data["data"].get("designspace", {})
        axes = ds.get("axes", [])
        for axis in axes:
            axis["label"] = axis["name"]
            axis["name"] = axis["tag"]
            del axis["tag"]
        return axes

    def _scheduleCachePurge(self):
        if self._tempGlyphDataCacheTimer is not None:
            self._tempGlyphDataCacheTimer.cancel()

        async def purgeGlyphCache():
            await asyncio.sleep(self._tempGlyphDataCacheTimeout)
            # print("clearing temp glyph cache")
            self._tempGlyphDataCache.clear()

        self._tempGlyphDataCacheTimer = asyncio.create_task(purgeGlyphCache())

    def _cacheBaseGlyphData(self, baseGlyphs):
        for glyphDict in baseGlyphs:
            typeCode, glyphID = self._glyphMapping[glyphDict["name"]]
            assert typeCode == glyphDict["type_code"]
            assert glyphID == glyphDict["id"]
            self._tempGlyphDataCache[(typeCode, glyphID)] = glyphDict
            # No need to recurse into glyphDict["made_of"], as getGlyph
            # does that for us.


def serializeGlyph(glifData, layers, axisDefaults):
    glyph = GLIFGlyph()
    pen = PathBuilderPointPen()
    readGlyphFromString(glifData, glyph, pen)

    defaultLayerDict = {
        "xAdvance": glyph.width,
    }
    defaultPath = pen.getPath()
    if defaultPath:
        defaultLayerDict["path"] = defaultPath

    defaultComponents = serializeComponents(
        glyph.lib.get("robocjk.deepComponents", ()), None, axisDefaults, None
    )
    dcNames = [c["name"] for c in defaultComponents]
    components = defaultComponents or pen.components
    componentNames = [c["name"] for c in components]
    if components:
        defaultLayerDict["components"] = components

    sources = [
        {
            "name": "<default>",
            "location": {},
            "layerName": "<default>/foreground",
        },
    ]
    layerData = [{"name": "<default>/foreground", "glyph": defaultLayerDict}]
    neutralComponentLocations = [compo.get("location", {}) for compo in components]

    for varDict in glyph.lib.get("robocjk.variationGlyphs", ()):
        if not varDict.get("on", True):
            continue
        layerName = varDict.get("layerName")
        sourceName = varDict.get("sourceName")
        if not sourceName and layerName:
            sourceName = layerName
        if layerName == "foreground":
            fontraLayerName = f"<default>/foreground"
        else:
            fontraLayerName = f"{sourceName}/foreground"
            varLayerDict = {}
            xAdvance = glyph.width
            if defaultPath and layerName and layerName in layers:
                varGlyph = GLIFGlyph()
                pen = PathBuilderPointPen()
                readGlyphFromString(layers[layerName], varGlyph, pen)
                xAdvance = varGlyph.width
                varPath = pen.getPath()
                if varPath:
                    varLayerDict["path"] = varPath
            varComponents = serializeComponents(
                varDict.get("deepComponents", ()),
                dcNames,
                axisDefaults,
                neutralComponentLocations,
            )
            varComponents = varComponents or pen.components
            assert componentNames == [c["name"] for c in varComponents]
            if varComponents:
                varLayerDict["components"] = varComponents
            xAdvance = varDict["width"] if "width" in varDict else xAdvance
            varLayerDict["xAdvance"] = xAdvance
            layerData.append(
                {"name": f"{sourceName}/foreground", "glyph": varLayerDict}
            )
        sources.append(
            {
                "name": sourceName,
                "location": varDict["location"],
                "layerName": fontraLayerName,
            }
        )

    glyphDict = {
        "name": glyph.name,
        "unicodes": glyph.unicodes,
        "axes": [cleanupAxis(axis) for axis in glyph.lib["robocjk.axes"]],
        "sources": sources,
        "layers": layerData,
    }
    return glyphDict


def serializeComponents(
    deepComponents, dcNames, axisDefaults, neutralComponentLocations
):
    if dcNames is not None:
        assert len(deepComponents) == len(dcNames)
    components = []
    for index, deepCompoDict in enumerate(deepComponents):
        component = {}
        name = deepCompoDict["name"] if "name" in deepCompoDict else dcNames[index]
        component["name"] = name
        if deepCompoDict["coord"]:
            component["location"] = cleanupLocation(
                deepCompoDict["coord"],
                axisDefaults[name],
                neutralComponentLocations[index]
                if neutralComponentLocations is not None
                else {},
            )
        component["transformation"] = deepCompoDict["transform"]
        components.append(component)
    return components


def cleanupLocation(location, axisDefaults, neutralLocation):
    return {
        a: location.get(a, neutralLocation.get(a, v)) for a, v in axisDefaults.items()
    }


def cleanupAxis(axisDict):
    axisDict = dict(axisDict)
    minValue = axisDict["minValue"]
    maxValue = axisDict["maxValue"]
    defaultValue = axisDict.get("defaultValue", minValue)
    minValue, maxValue = sorted([minValue, maxValue])
    axisDict["minValue"] = minValue
    axisDict["defaultValue"] = defaultValue
    axisDict["maxValue"] = maxValue
    return axisDict


class GLIFGlyph:
    unicodes = ()
    width = 0


_getGlyphMethods = {
    "AE": "atomic_element_get",
    "DC": "deep_component_get",
    "CG": "character_glyph_get",
}


_glyphListMethods = {
    "AE": "atomic_element_list",
    "DC": "deep_component_list",
    "CG": "character_glyph_list",
}


def extractAxisDefaults(baseGlyphDict):
    axisDefaults = {}
    glyph = GLIFGlyph()
    readGlyphFromString(baseGlyphDict["data"], glyph)
    axisDefaults[glyph.name] = {
        a["name"]: a["defaultValue"] for a in glyph.lib.get("robocjk.axes", ())
    }

    # handle nested made_of glyphs
    for subGlyphDict in baseGlyphDict.get("made_of", ()):
        axisDefaults.update(extractAxisDefaults(subGlyphDict))

    return axisDefaults
