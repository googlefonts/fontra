import logging
import re

from fontTools.ufoLib.filenames import userNameToFileName

logger = logging.getLogger(__name__)


_glyphNamePat = re.compile(rb'<glyph\s+name\s*=\s*"([^"]+)"')
_unicodePat = re.compile(rb'<unicode\s+hex\s*=\s*"([^"]+)"')


def extractGlyphNameAndCodePoints(
    data: bytes, fileName: str | None = None
) -> tuple[str, list[int]]:
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
    codePoints = [int(u, 16) for u in _unicodePat.findall(data)]
    return glyphName, codePoints
