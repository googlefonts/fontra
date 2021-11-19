import pathlib
import pytest
from fontra.backends.rcjk import RCJKBackend


dataDir = pathlib.Path(__file__).resolve().parent / "data"


@pytest.mark.asyncio
async def test_fooo():
    font = RCJKBackend(dataDir / "figArnaud.rcjk")
    glyphNames = await font.getGlyphNames()
    assert len(glyphNames) == 80
    glyph = await font.getGlyph("one_00")
    assert glyph["name"] == "one_00"
    assert glyph["sources"][0]["location"] == {}
    assert glyph["sources"][0]["source"]["components"] == []
    assert glyph["sources"][0]["source"]["path"]["contours"] == [
        {"endPoint": 9, "isClosed": True}
    ]
    glyph = await font.getGlyph("uni0031")
    assert glyph["sources"][0]["source"]["components"] == [
        {
            "coord": {"T_H_lo": 0, "X_X_bo": 0},
            "name": "DC_0031_00",
            "transform": {
                "rotation": 0,
                "scalex": 1,
                "scaley": 1,
                "tcenterx": 0,
                "tcentery": 0,
                "x": -1,
                "y": 0,
            },
        }
    ]
