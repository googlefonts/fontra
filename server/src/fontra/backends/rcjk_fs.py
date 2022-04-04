import json
import pathlib
from .ufo_utils import GLIFGlyph, extractGlyphNameAndUnicodes
from .rcjk_base import TimedCache, getComponentAxisDefaults, serializeGlyph


glyphSetNames = ["characterGlyph", "deepComponent", "atomicElement"]


class RCJKBackend:
    @classmethod
    def fromPath(cls, path):
        return cls(path)

    def __init__(self, path):
        self.path = pathlib.Path(path).resolve()
        for name in glyphSetNames:
            setattr(self, name + "GlyphSet", RCJKGlyphSet(self.path / name))

        if not self.characterGlyphGlyphSet.exists():
            raise TypeError(f"Not a valid rcjk project: '{path}'")

        designspacePath = self.path / "designspace.json"
        if designspacePath.is_file():
            self.designspace = json.loads(designspacePath.read_bytes())
        else:
            self.designspace = {}

        self.reversedCmap = {}
        for gs, hasEncoding in self._iterGlyphSets():
            reversedCmap = gs.getGlyphNamesAndUnicodes(not hasEncoding)
            for glyphName, unicodes in reversedCmap.items():
                assert glyphName not in self.reversedCmap
                self.reversedCmap[glyphName] = unicodes if hasEncoding else []
        self.glyphNames = sorted(self.reversedCmap)

        self._tempGlyphCache = TimedCache()

    def _iterGlyphSets(self):
        yield self.characterGlyphGlyphSet, True
        yield self.deepComponentGlyphSet, False
        yield self.atomicElementGlyphSet, False

    async def getReverseCmap(self):
        return self.reversedCmap

    async def getGlobalAxes(self):
        axes = getattr(self, "_globalAxes", None)
        if axes is None:
            axes = []
            for axis in self.designspace.get("axes", ()):
                axis = dict(axis)
                axis["label"] = axis["name"]
                axis["name"] = axis["tag"]
                del axis["tag"]
                axes.append(axis)
            self._globalAxes = axes
        return axes

    async def getGlyph(self, glyphName):
        layerGlyphs = self._getLayerGlyphs(glyphName)
        axisDefaults = getComponentAxisDefaults(layerGlyphs, self._tempGlyphCache)
        return serializeGlyph(layerGlyphs, axisDefaults)

    def _getLayerGlyphs(self, glyphName):
        layerGlyphs = self._tempGlyphCache.get(glyphName)
        if layerGlyphs is None:
            self._populateGlyphCache(glyphName)
            self._tempGlyphCache.updateTimeOut()
            layerGlyphs = self._tempGlyphCache[glyphName]
        return layerGlyphs

    def _populateGlyphCache(self, glyphName):
        if glyphName in self._tempGlyphCache:
            return
        layerGLIFData = self._getLayerGLIFData(glyphName)
        if layerGLIFData is None:
            return

        layerGlyphs = {}
        for layerName, glifData in layerGLIFData:
            layerGlyphs[layerName] = GLIFGlyph.fromGLIFData(glifData)
        self._tempGlyphCache[glyphName] = layerGlyphs

        for compoName in layerGlyphs["foreground"].getComponentNames():
            self._populateGlyphCache(compoName)

    def _getLayerGLIFData(self, glyphName):
        for gs, _ in self._iterGlyphSets():
            if glyphName in gs:
                return gs.getGlyphLayerData(glyphName)
        return None


class RCJKGlyphSet:
    def __init__(self, path):
        self.path = path
        self.revCmap = None
        self.contents = {}
        self.layers = {}
        self.setupLayers()

    def exists(self):
        return self.path.is_dir()

    def setupLayers(self):
        if not self.exists():
            return
        for layerDir in self.path.iterdir():
            if layerDir.is_dir():
                glifPaths = {
                    glifPath.name: glifPath for glifPath in layerDir.glob("*.glif")
                }
                if glifPaths:
                    self.layers[layerDir.name] = glifPaths

    def getGlyphNamesAndUnicodes(self, ignoreUnicodes=False):
        if self.revCmap is None:
            glyphNames = {}
            for path in self.path.glob("*.glif"):
                with open(path, "rb") as f:
                    # assuming all unicodes are in the first 1024 bytes of the file
                    data = f.read(1024)
                glyphName, unicodes = extractGlyphNameAndUnicodes(data, path.name)
                if ignoreUnicodes:
                    unicodes = []
                glyphNames[glyphName] = unicodes
                self.contents[glyphName] = path
            self.revCmap = glyphNames
        return self.revCmap

    def __contains__(self, glyphName):
        return glyphName in self.contents

    def getGlyphLayerData(self, glyphName):
        mainPath = self.contents.get(glyphName)
        if mainPath is None:
            return None
        mainFileName = mainPath.name
        glyphLayerData = [("foreground", mainPath.read_bytes())]
        for layerName, layerContents in self.layers.items():
            layerPath = layerContents.get(mainFileName)
            if layerPath is not None:
                glyphLayerData.append((layerName, layerPath.read_bytes()))
        return glyphLayerData
