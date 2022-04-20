from .rcjk_base import TimedCache, getComponentAxisDefaults, serializeGlyph
from .ufo_utils import GLIFGlyph


class RCJKMySQLBackend:
    @classmethod
    def fromRCJKClient(cls, client, fontUID):
        self = cls()
        self.client = client
        self.fontUID = fontUID
        self._glyphMapping = None
        self._tempGlyphCache = TimedCache()
        return self

    def close(self):
        self._tempGlyphCache.cancel()

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

    async def _getMiscFontItems(self):
        font_data = await self.client.font_get(self.fontUID)
        self.designspace = font_data["data"].get("designspace", {})
        self.fontLib = font_data["data"].get("fontlib", {})

    async def getGlobalAxes(self):
        if not hasattr(self, "designspace"):
            await self._getMiscFontItems()
        if not hasattr(self, "axes"):
            axes = self.designspace.get("axes", ())
            for axis in axes:
                axis["label"] = axis["name"]
                axis["name"] = axis["tag"]
                del axis["tag"]
            self.axes = axes
        return self.axes

    async def getFontLib(self):
        if not hasattr(self, "fontLib"):
            await self._getMiscFontItems()
        return self.fontLib

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
            self._tempGlyphCache.updateTimeOut()
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
