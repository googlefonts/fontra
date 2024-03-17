import asyncio
import csv
import json
import logging
import pathlib
import shutil
from copy import deepcopy
from dataclasses import dataclass, field
from os import PathLike
from typing import Any, Callable

from fontra.core.classes import (
    Font,
    GlobalAxis,
    GlobalDiscreteAxis,
    GlobalSource,
    VariableGlyph,
    structure,
    unstructure,
)
from fontra.core.protocols import WritableFontBackend

from .filenames import stringToFileName

logger = logging.getLogger(__name__)


class FontraBackend:
    glyphInfoFileName = "glyph-info.csv"
    fontDataFileName = "font-data.json"
    glyphsDirName = "glyphs"

    @classmethod
    def fromPath(cls, path) -> WritableFontBackend:
        return cls(path=path)

    @classmethod
    def createFromPath(cls, path) -> WritableFontBackend:
        return cls(path=path, create=True)

    def __init__(self, *, path: PathLike, create: bool = False):
        self.path = pathlib.Path(path).resolve()
        if create:
            if self.path.is_dir():
                shutil.rmtree(self.path)
            elif self.path.exists():
                self.path.unlink()
            self.path.mkdir()
        self.glyphsDir.mkdir(exist_ok=True)
        self.glyphMap: dict[str, list[int]] = {}
        if not create:
            self._readGlyphInfo()
            self._readFontData()
        else:
            self.fontData = Font()
            self._writeGlyphInfo()
            self._writeFontData()
        self._scheduler = Scheduler()

    @property
    def fontDataPath(self):
        return self.path / self.fontDataFileName

    @property
    def glyphInfoPath(self):
        return self.path / self.glyphInfoFileName

    @property
    def glyphsDir(self):
        return self.path / self.glyphsDirName

    async def aclose(self):
        self.flush()

    def flush(self):
        self._scheduler.flush()

    async def getUnitsPerEm(self) -> int:
        return self.fontData.unitsPerEm

    async def putUnitsPerEm(self, unitsPerEm: int) -> None:
        self.fontData.unitsPerEm = unitsPerEm
        self._scheduler.schedule(self._writeFontData)

    async def getGlyphMap(self) -> dict[str, list[int]]:
        return dict(self.glyphMap)

    async def putGlyphMap(self, value: dict[str, list[int]]) -> None:
        pass

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        if glyphName not in self.glyphMap:
            return None
        try:
            jsonSource = self.getGlyphData(glyphName)
        except KeyError:
            return None
        return deserializeGlyph(jsonSource, glyphName)

    async def putGlyph(
        self, glyphName: str, glyph: VariableGlyph, codePoints: list[int]
    ) -> None:
        jsonSource = serializeGlyph(glyph, glyphName)
        filePath = self.getGlyphFilePath(glyphName)
        filePath.write_text(jsonSource, encoding="utf=8")
        self.glyphMap[glyphName] = codePoints
        self._scheduler.schedule(self._writeGlyphInfo)

    async def deleteGlyph(self, glyphName: str) -> None:
        if glyphName not in self.glyphMap:
            raise KeyError(f"Glyph '{glyphName}' does not exist")
        filePath = self.getGlyphFilePath(glyphName)
        filePath.unlink()
        del self.glyphMap[glyphName]
        self._scheduler.schedule(self._writeGlyphInfo)

    async def getGlobalAxes(self) -> list[GlobalAxis | GlobalDiscreteAxis]:
        return deepcopy(self.fontData.axes)

    async def putGlobalAxes(self, axes: list[GlobalAxis | GlobalDiscreteAxis]) -> None:
        self.fontData.axes = deepcopy(axes)
        self._scheduler.schedule(self._writeFontData)

    async def getSources(self) -> dict[str, GlobalSource]:
        return []

    async def getCustomData(self) -> dict[str, Any]:
        return deepcopy(self.fontData.customData)

    async def putCustomData(self, customData: dict[str, Any]) -> None:
        self.fontData.customData = deepcopy(customData)
        self._scheduler.schedule(self._writeFontData)

    def _readGlyphInfo(self) -> None:
        with open(self.glyphInfoPath, "r", encoding="utf-8") as file:
            reader = csv.reader(file, delimiter=";")
            header = next(reader)
            assert header[:2] == ["glyph name", "code points"]
            for row in reader:
                glyphName, *rest = row
                if rest:
                    codePoints = _parseCodePoints(rest[0])
                else:
                    codePoints = []
                self.glyphMap[glyphName] = codePoints

    def _writeGlyphInfo(self) -> None:
        with open(self.glyphInfoPath, "w", encoding="utf-8") as file:
            writer = csv.writer(file, delimiter=";")
            writer.writerow(["glyph name", "code points"])
            for glyphName, codePoints in sorted(self.glyphMap.items()):
                codePointsString = ",".join(f"U+{cp:04X}" for cp in codePoints)
                writer.writerow([glyphName, codePointsString])

    def _readFontData(self) -> None:
        self.fontData = structure(
            json.loads(self.fontDataPath.read_text(encoding="utf-8")), Font
        )

    def _writeFontData(self) -> None:
        fontData = unstructure(self.fontData)
        fontData.pop("glyphs", None)
        fontData.pop("glyphMap", None)
        self.fontDataPath.write_text(serialize(fontData) + "\n", encoding="utf-8")

    def getGlyphData(self, glyphName: str) -> str:
        filePath = self.getGlyphFilePath(glyphName)
        if not filePath.is_file():
            raise KeyError(glyphName)
        return filePath.read_text(encoding="utf-8")

    def getGlyphFilePath(self, glyphName):
        return self.glyphsDir / (stringToFileName(glyphName) + ".json")


def _parseCodePoints(cell: str) -> list[int]:
    codePoints = []
    cell = cell.strip()
    if cell:
        for s in cell.split(","):
            s = s.strip()
            # U+ should become mandatory, but for now let's be lenient
            if s.startswith("U+"):
                s = s[2:]
            codePoints.append(int(s, 16))
    return codePoints


def serializeGlyph(glyph, glyphName=None):
    glyph = glyph.convertToPaths()
    jsonGlyph = unstructure(glyph)
    if glyphName is not None:
        jsonGlyph["name"] = glyphName
    return serialize(jsonGlyph) + "\n"


def deserializeGlyph(jsonSource: str, glyphName: str | None = None) -> VariableGlyph:
    jsonGlyph = json.loads(jsonSource)
    if glyphName is not None:
        jsonGlyph["name"] = glyphName
    glyph = structure(jsonGlyph, VariableGlyph)
    return glyph.convertToPackedPaths()


def serialize(data: list | dict) -> str:
    return json.dumps(data, indent=0, ensure_ascii=False)


@dataclass(kw_only=True)
class Scheduler:
    delay: float = 0.2
    scheduledCallables: dict[str, Callable] = field(default_factory=dict)
    timerHandle: asyncio.TimerHandle | None = None

    def schedule(self, callable: Callable):
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
