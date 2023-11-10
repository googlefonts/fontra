import csv
import json
import pathlib
import shutil
import string
from copy import deepcopy
from dataclasses import asdict
from urllib.parse import unquote

import dacite

from fontra.core.classes import Font, VariableGlyph
from fontra.core.path import PackedPath, Path

FILENAME_GLYPH_INFO = "glyph-info.csv"
FILENAME_FONT_DATA = "font-data.json"
DIRNAME_GLYPHS = "glyphs"


class FontraBackend:
    @classmethod
    def fromPath(cls, path):
        return cls(path=path)

    @classmethod
    def createFromPath(cls, path):
        return cls(path=path, create=True)

    def __init__(self, *, path=None, create=False):
        self.path = pathlib.Path(path).resolve() if path is not None else None
        if create:
            if self.path.is_dir():
                shutil.rmtree(self.path)
            elif self.path.exists():
                self.path.unlink()
            self.path.mkdir()
        self.glyphsDir = self.path / DIRNAME_GLYPHS
        self.glyphsDir.mkdir(exist_ok=True)
        self.glyphMap = {}
        if not create:
            self._readGlyphInfo()
            self._readFontData()
        else:
            self.fontData = Font()

    def close(self):
        pass

    async def getUnitsPerEm(self):
        return self.fontData.unitsPerEm

    async def putUnitsPerEm(self, unitsPerEm):
        self.fontData.unitsPerEm = unitsPerEm
        self._writeFontData()

    async def getGlyphMap(self):
        return dict(self.glyphMap)

    async def getGlyph(self, glyphName):
        filePath = self._getGlyphFilePath(glyphName)
        if not filePath.is_file():
            raise KeyError(glyphName)
        jsonSource = filePath.read_text(encoding="utf-8")
        return deserializeGlyph(jsonSource, glyphName)

    async def putGlyph(self, glyphName, glyph, codePoints):
        jsonSource = serializeGlyph(glyph, glyphName)
        filePath = self._getGlyphFilePath(glyphName)
        filePath.write_text(jsonSource, encoding="utf=8")
        self.glyphMap[glyphName] = codePoints
        self._writeGlyphInfo()

    async def deleteGlyph(self, glyphName):
        self.glyphMap.pop(glyphName, None)

    async def getGlobalAxes(self):
        return deepcopy(self.fontData.axes)

    async def putGlobalAxes(self, axes):
        self.fontData.axes = deepcopy(axes)
        self._writeFontData()

    async def getFontLib(self):
        return {}

    def _readGlyphInfo(self):
        glyphInfoPath = self.path / FILENAME_GLYPH_INFO
        with open(glyphInfoPath, "r", encoding="utf-8") as file:
            reader = csv.reader(file, delimiter=";")
            header = next(reader)
            assert header[:2] == ["glyph name", "code points"]
            for row in reader:
                glyphName, *rest = row
                if rest:
                    codePoints = [int(cp, 16) for cp in rest[0].split(",") if cp]
                else:
                    codePoints = []
                self.glyphMap[glyphName] = codePoints

    def _writeGlyphInfo(self):
        glyphInfoPath = self.path / FILENAME_GLYPH_INFO
        with open(glyphInfoPath, "w", encoding="utf-8") as file:
            writer = csv.writer(file, delimiter=";")
            writer.writerow(["glyph name", "code points"])
            for glyphName, codePoints in sorted(self.glyphMap.items()):
                codePoints = ",".join(f"{cp:04X}" for cp in codePoints)
                writer.writerow([glyphName, codePoints])

    def _readFontData(self):
        fontDataPath = self.path / FILENAME_FONT_DATA
        self.fontData = dacite.from_dict(
            Font, json.loads(fontDataPath.read_text(encoding="utf-8"))
        )

    def _writeFontData(self):
        fontDataPath = self.path / FILENAME_FONT_DATA
        fontData = asdict(self.fontData)
        fontData.pop("glyphs", None)
        fontData.pop("glyphMap", None)
        fontDataPath.write_text(serialize(fontData) + "\n", encoding="utf-8")

    def _getGlyphFilePath(self, glyphName):
        return self.glyphsDir / (userNameToFileName(glyphName) + ".json")


def serializeGlyph(glyph, glyphName=None):
    glyph = glyph.convertToPaths()
    jsonGlyph = asdict(glyph)
    if glyphName is not None:
        jsonGlyph["name"] = glyphName
    return serialize(jsonGlyph) + "\n"


def deserializeGlyph(jsonSource, glyphName=None):
    jsonGlyph = json.loads(jsonSource)
    if glyphName is not None:
        jsonGlyph["name"] = glyphName
    glyph = dacite.from_dict(VariableGlyph, jsonGlyph, daciteConfig)
    return glyph.convertToPackedPaths()


def serialize(data):
    return json.dumps(data, indent=0)


def _ensurePackedPathData(data):
    if "coordinates" not in data:
        raise TypeError("not a PackedPath")
    raise TypeError("PackedPath not supported in this context")


def _ensurePathData(data):
    if "contours" not in data:
        raise TypeError("not a Path")
    return Path(**data)


daciteConfig = dacite.Config(
    type_hooks={PackedPath: _ensurePackedPathData, Path: _ensurePathData},
    strict_unions_match=False,
)


#
# Glyph name to file name algorithm, originally proposed for UFO
# See also https://github.com/unified-font-object/ufo-spec/issues/164
#


separatorChar = "^"

# TODO: [insert references]
reservedCharacters = set(' " % * + / : < > ? [ \\ ] | '.split())
reservedCharacters.update(chr(i) for i in range(32))
# reservedCharacters.add(" ")  # should we escape space chars or not?
reservedCharacters.add(chr(0x7F))
reservedCharacters.add(separatorChar)
assert all(len(c) == 1 for c in reservedCharacters)


# TODO: [insert references]
reservedFileNames = set(
    """
CON
PRN
AUX
CLOCK$
NUL
COM1
LPT1
LPT2
LPT3
COM2
COM3
COM4
""".lower().split()
)


base32chars = string.digits + string.ascii_uppercase[:22]
assert len(set(base32chars)) == 32


def userNameToFileName(userName):
    codeDigits = []
    for i in range(0, len(userName), 5):
        digit = 0
        bit = 1
        for c in userName[i : i + 5]:
            if c.isupper():
                digit |= bit
            bit <<= 1
        codeDigits.append(digit)
    # strip trailing zeros
    while codeDigits and codeDigits[-1] == 0:
        codeDigits.pop()
    name = "".join(f"%{ord(c):02X}" if c in reservedCharacters else c for c in userName)
    if name[0] == ".":
        name = "%2E" + name[1:]
    if not codeDigits and name.lower() in reservedFileNames:
        codeDigits = [0]
    if codeDigits:
        disambiguationCode = separatorChar + "".join(base32chars[d] for d in codeDigits)
    else:
        disambiguationCode = ""
    return name + disambiguationCode


def fileNameToUserName(fileName):
    name = fileName.split(separatorChar, 1)[0]
    return unquote(name, encoding="ascii", errors="strict")
