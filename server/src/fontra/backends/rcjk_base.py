import asyncio


def getComponentAxisDefaults(layerGlyphs, layerGlyphCache):
    axisDefaults = {}
    for componentGlyphName in layerGlyphs["foreground"].getComponentNames():
        componentGlyph = layerGlyphCache.get(componentGlyphName)
        if componentGlyph is not None:
            axisDefaults[componentGlyphName] = {
                axis["name"]: axis["defaultValue"]
                for axis in componentGlyph["foreground"].axes
            }
    return axisDefaults


def serializeGlyph(layerGlyphs, axisDefaults):
    layers = {
        layerName: {"name": layerName, "glyph": glyph.serialize()}
        for layerName, glyph in layerGlyphs.items()
    }

    defaultGlyph = layerGlyphs["foreground"]
    defaultComponents = serializeComponents(
        defaultGlyph.lib.get("robocjk.deepComponents", ()), axisDefaults, None, None
    )
    if defaultComponents:
        layers["foreground"]["glyph"]["components"] = defaultComponents

    dcNames = [c["name"] for c in defaultComponents]
    defaultComponentLocations = [
        compo.get("location", {}) for compo in defaultComponents
    ]
    componentNames = [
        c["name"] for c in layers["foreground"]["glyph"].get("components", ())
    ]

    sources = [
        {"name": "<default>", "location": {}, "layerName": "foreground"},
    ]
    variationGlyphData = defaultGlyph.lib.get("robocjk.variationGlyphs", ())
    for sourceIndex, varDict in enumerate(variationGlyphData, 1):
        if not varDict.get("on", True):
            # XXX TODO add support for "on flag"
            continue
        layerName = varDict.get("layerName")
        sourceName = varDict.get("sourceName")
        if not sourceName:
            sourceName = layerName if layerName else f"source_{sourceIndex}"
        if not layerName:
            layerName = f"{sourceName}_{sourceIndex}_layer"
            assert layerName not in layers, layerName

        xAdvance = defaultGlyph.width
        if layerName in layers:
            layerGlyphDict = layers[layerName]["glyph"]
            xAdvance = layerGlyphs[layerName].width
        else:
            layerGlyphDict = {}
            layerDict = {"name": layerName, "glyph": layerGlyphDict}
            layers[layerName] = layerDict

        if "width" in varDict:
            xAdvance = varDict["width"]
        layerGlyphDict["xAdvance"] = xAdvance

        components = serializeComponents(
            varDict.get("deepComponents", ()),
            axisDefaults,
            dcNames,
            defaultComponentLocations,
        )
        if components:
            layerGlyphDict["components"] = components

        assert componentNames == [
            c["name"] for c in layerGlyphDict.get("components", ())
        ]
        location = varDict["location"]
        sources.append(
            {"name": sourceName, "location": location, "layerName": layerName}
        )

    return {
        "name": defaultGlyph.name,
        "unicodes": defaultGlyph.unicodes,
        "axes": defaultGlyph.axes,
        "sources": sources,
        "layers": list(layers.values()),
    }


def serializeComponents(
    deepComponents, axisDefaults, dcNames, neutralComponentLocations
):
    if dcNames is not None:
        assert len(deepComponents) == len(dcNames)
    if neutralComponentLocations is None:
        neutralComponentLocations = [{}] * len(deepComponents)
    components = []
    for index, deepCompoDict in enumerate(deepComponents):
        component = {}
        name = deepCompoDict["name"] if "name" in deepCompoDict else dcNames[index]
        component["name"] = name
        if deepCompoDict["coord"]:
            component["location"] = cleanupLocation(
                deepCompoDict["coord"],
                axisDefaults[name],
                neutralComponentLocations[index],
            )
        component["transformation"] = deepCompoDict["transform"]
        components.append(component)
    return components


def cleanupLocation(location, axisDefaults, neutralLocation):
    return {
        a: location.get(a, neutralLocation.get(a, v)) for a, v in axisDefaults.items()
    }


class TimedCache:
    def __init__(self, timeOut=5):
        self.cacheDict = {}
        self.timeOut = timeOut
        self.timerTask = None

    def get(self, key, default=None):
        return self.cacheDict.get(key, default)

    def __getitem__(self, key):
        return self.cacheDict[key]

    def __setitem__(self, key, value):
        self.cacheDict[key] = value

    def __contains__(self, key):
        return key in self.cacheDict

    def updateTimeOut(self):
        if self.timerTask is not None:
            self.timerTask.cancel()

        async def clearCacheDict():
            await asyncio.sleep(self.timeOut)
            self.cacheDict.clear()

        self.timerTask = asyncio.create_task(clearCacheDict())
