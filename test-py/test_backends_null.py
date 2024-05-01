from fontra.backends.null import NullBackend
from fontra.core.classes import Axes, FontInfo, OpenTypeFeatures
from fontra.core.protocols import ReadableFontBackend


async def test_nullBackend():
    backend = NullBackend()
    assert isinstance(backend, ReadableFontBackend)
    assert {} == await backend.getGlyphMap()
    assert FontInfo() == await backend.getFontInfo()
    assert Axes() == await backend.getAxes()
    assert {} == await backend.getSources()
    assert OpenTypeFeatures() == await backend.getFeatures()
    assert None is await backend.getGlyph("any_glyph_name")
    assert {} == await backend.getCustomData()
    assert 1000 == await backend.getUnitsPerEm()
    await backend.aclose()
    assert backend is NullBackend()  # assert it's a singleton
