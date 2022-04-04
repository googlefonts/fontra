import asyncio
from .rcjk_base import getComponentAxisDefaults, serializeGlyph
from .ufo_utils import GLIFGlyph


class RCJKMySQLBackend:
    @classmethod
    def fromRCJKClient(cls, client, fontUID):
        self = cls()
        self.client = client
        self.fontUID = fontUID
        self._glyphMapping = None
        self._tempGlyphCache = {}
        self._tempGlyphCacheTimer = None
        self._tempGlyphCacheTimeout = 5
        return self

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

    async def getGlobalAxes(self):
        font_data = await self.client.font_get(self.fontUID)
        ds = font_data["data"].get("designspace", {})
        axes = ds.get("axes", ())
        for axis in axes:
            axis["label"] = axis["name"]
            axis["name"] = axis["tag"]
            del axis["tag"]
        return axes

    async def getGlyph(self, glyphName):
        layerGlyphs = await self._getLayerGlyphs(glyphName)
        axisDefaults = getComponentAxisDefaults(layerGlyphs, self._tempGlyphCache)
        return serializeGlyph(layerGlyphs, axisDefaults)

    async def _getLayerGlyphs(self, glyphName):
        layerGlyphs = self._tempGlyphCache.get(glyphName)
        if layerGlyphs is None:
            typeCode, glyphID = self._glyphMapping[glyphName]
            getMethodName = _getGlyphMethods[typeCode]
            method = getattr(self.client, getMethodName)
            response = await method(
                self.fontUID, glyphID, return_layers=True, return_related=True
            )
            glyphData = response["data"]
            self._populateGlyphCache(glyphName, glyphData)
            self._scheduleCachePurge()
            layerGlyphs = self._tempGlyphCache[glyphName]
        return layerGlyphs

    def _populateGlyphCache(self, glyphName, glyphData):
        if glyphName in self._tempGlyphCache:
            return
        self._tempGlyphCache[glyphName] = buildLayerGlyphs(glyphData)
        for subGlyphData in glyphData.get("made_of", ()):
            subGlyphName = subGlyphData["name"]
            typeCode, glyphID = self._glyphMapping[subGlyphName]
            assert typeCode == subGlyphData["type_code"]
            assert glyphID == subGlyphData["id"]
            self._populateGlyphCache(subGlyphName, subGlyphData)

    def _scheduleCachePurge(self):
        if self._tempGlyphCacheTimer is not None:
            self._tempGlyphCacheTimer.cancel()

        async def purgeGlyphCache():
            await asyncio.sleep(self._tempGlyphCacheTimeout)
            # print("clearing temp glyph cache")
            self._tempGlyphCache.clear()

        self._tempGlyphCacheTimer = asyncio.create_task(purgeGlyphCache())


def buildLayerGlyphs(glyphData):
    layerGLIFData = [("foreground", glyphData["data"])]
    layerGLIFData.extend(
        (layer["group_name"], layer["data"]) for layer in glyphData.get("layers", ())
    )
    layerGlyphs = {}
    for layerName, glifData in layerGLIFData:
        layerGlyphs[layerName] = GLIFGlyph.fromGLIFData(glifData)
    return layerGlyphs


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
