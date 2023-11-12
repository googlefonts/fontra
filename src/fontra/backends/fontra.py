import asyncio
import csv
import json
import logging
import pathlib
import shutil
import typing
from copy import deepcopy
from dataclasses import asdict, dataclass, field

import dacite

from fontra.core.classes import Font, VariableGlyph
from fontra.core.path import PackedPath, Path

from .filenames import stringToFileName

logger = logging.getLogger(__name__)


class FontraBackend:
    glyphInfoFileName = "glyph-info.csv"
    fontDataFileName = "font-data.json"
    glyphsDirName = "glyphs"

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
        self.glyphsDir = self.path / self.glyphsDirName
        self.glyphsDir.mkdir(exist_ok=True)
        self.glyphMap = {}
        if not create:
            self._readGlyphInfo()
            self._readFontData()
        else:
            self.fontData = Font()
        self._scheduler = Scheduler()

    def close(self):
        self.flush()

    def flush(self):
        self._scheduler.flush()

    async def getUnitsPerEm(self):
        return self.fontData.unitsPerEm

    async def putUnitsPerEm(self, unitsPerEm):
        self.fontData.unitsPerEm = unitsPerEm
        self._scheduler.schedule(self._writeFontData)

    async def getGlyphMap(self):
        return dict(self.glyphMap)

    async def getGlyph(self, glyphName):
        jsonSource = self.getGlyphData(glyphName)
        return deserializeGlyph(jsonSource, glyphName)

    async def putGlyph(self, glyphName, glyph, codePoints):
        jsonSource = serializeGlyph(glyph, glyphName)
        filePath = self.getGlyphFilePath(glyphName)
        filePath.write_text(jsonSource, encoding="utf=8")
        self.glyphMap[glyphName] = codePoints
        self._scheduler.schedule(self._writeGlyphInfo)

    async def deleteGlyph(self, glyphName):
        self.glyphMap.pop(glyphName, None)

    async def getGlobalAxes(self):
        return deepcopy(self.fontData.axes)

    async def putGlobalAxes(self, axes):
        self.fontData.axes = deepcopy(axes)
        self._scheduler.schedule(self._writeFontData)

    async def getFontLib(self):
        return {}

    def _readGlyphInfo(self):
        glyphInfoPath = self.path / self.glyphInfoFileName
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
        glyphInfoPath = self.path / self.glyphInfoFileName
        with open(glyphInfoPath, "w", encoding="utf-8") as file:
            writer = csv.writer(file, delimiter=";")
            writer.writerow(["glyph name", "code points"])
            for glyphName, codePoints in sorted(self.glyphMap.items()):
                codePoints = ",".join(f"{cp:04X}" for cp in codePoints)
                writer.writerow([glyphName, codePoints])

    def _readFontData(self):
        fontDataPath = self.path / self.fontDataFileName
        self.fontData = dacite.from_dict(
            Font, json.loads(fontDataPath.read_text(encoding="utf-8"))
        )

    def _writeFontData(self):
        fontDataPath = self.path / self.fontDataFileName
        fontData = asdict(self.fontData)
        fontData.pop("glyphs", None)
        fontData.pop("glyphMap", None)
        fontDataPath.write_text(serialize(fontData) + "\n", encoding="utf-8")

    def getGlyphData(self, glyphName):
        filePath = self.getGlyphFilePath(glyphName)
        if not filePath.is_file():
            raise KeyError(glyphName)
        return filePath.read_text(encoding="utf-8")

    def getGlyphFilePath(self, glyphName):
        return self.glyphsDir / (stringToFileName(glyphName) + ".json")


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


@dataclass(kw_only=True)
class Scheduler:
    delay: float = 0.2
    scheduledCallables: dict[str, callable] = field(default_factory=dict)
    timerHandle: typing.Optional[asyncio.TimerHandle] = None

    def schedule(self, callable):
        self.scheduledCallables[callable.__name__] = callable
        if self.timerHandle is not None:
            self.timerHandle.cancel()
        loop = asyncio.get_running_loop()
        self.timerHandle = loop.call_later(self.delay, self.flush)

    def flush(self):
        if self.timerHandle is not None:
            self.timerHandle.cancel()
            self.timerHandle = None
        logger.debug("calling scheduled callables")
        for callable in self.scheduledCallables.values():
            callable()
        self.scheduledCallables = {}
