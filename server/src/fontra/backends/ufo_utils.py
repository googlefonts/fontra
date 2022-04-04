from functools import cached_property
import re
from fontTools.ufoLib.filenames import userNameToFileName
from fontTools.ufoLib.glifLib import readGlyphFromString
from .pen import PathBuilderPointPen


class GLIFGlyph:
    @classmethod
    def fromGLIFData(cls, glifData):
        self = cls()
        self.unicodes = []
        self.width = 0
        pen = PathBuilderPointPen()
        readGlyphFromString(glifData, self, pen)
        self.path = pen.getPath()
        self.components = pen.components
        return self

    @cached_property
    def axes(self):
        return [cleanupAxis(axis) for axis in self.lib.get("robocjk.axes", ())]

    def getComponentNames(self):
        classicComponentNames = {compo["name"] for compo in self.components}
        deepComponentNames = {
            compo["name"] for compo in self.lib.get("robocjk.deepComponents", ())
        }
        return sorted(classicComponentNames | deepComponentNames)

    def serialize(self):
        glyphDict = {"xAdvance": self.width}
        if self.path:
            glyphDict["path"] = self.path
        if self.components:
            glyphDict["components"] = self.components

        return glyphDict


_glyphNamePat = re.compile(rb'<glyph\s+name\s*=\s*"([^"]+)"')
_unicodePat = re.compile(rb'<unicode\s+hex\s*=\s*"([^"]+)"')


def extractGlyphNameAndUnicodes(data, fileName=None):
    m = _glyphNamePat.search(data)
    if m is None:
        raise ValueError(f"invalid .glif file, glyph name not found ({fileName})")
    glyphName = m.group(1).decode("utf-8")
    if fileName is not None:
        refFileName = userNameToFileName(glyphName, suffix=".glif")
        if refFileName != fileName:
            logger.warning(
                "actual file name does not match predicted file name: "
                f"{refFileName} {fileName} {glyphName}"
            )
    unicodes = [int(u, 16) for u in _unicodePat.findall(data)]
    return glyphName, unicodes


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
