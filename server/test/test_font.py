import pathlib
import pytest
from fontra.backends.rcjk import RCJKBackend


dataDir = pathlib.Path(__file__).resolve().parent / "data"

testData = [
    {
        "axes": {"HLON": (0.0, 0.0, 1.0), "WGHT": (0.0, 0.0, 1.0)},
        "name": "one_00",
        "unicodes": [],
        "sources": [
            {
                "location": {},
                "source": {
                    "path": {
                        "coordinates": [
                            105,
                            0,
                            134,
                            0,
                            134,
                            600,
                            110,
                            600,
                            92,
                            600,
                            74,
                            598,
                            59,
                            596,
                            30,
                            592,
                            30,
                            572,
                            105,
                            572,
                        ],
                        "pointTypes": [0, 0, 0, 8, 2, 2, 8, 0, 0, 0],
                        "contours": [{"endPoint": 9, "isClosed": True}],
                    },
                    "components": [],
                    "xAdvance": 229,
                },
            },
            {
                "location": {"HLON": 1.0},
                "source": {
                    "path": {
                        "coordinates": [
                            175,
                            0,
                            204,
                            0,
                            204,
                            600,
                            180,
                            600,
                            152,
                            600,
                            124,
                            598,
                            99,
                            597,
                            0,
                            592,
                            0,
                            572,
                            175,
                            572,
                        ],
                        "pointTypes": [0, 0, 0, 8, 2, 2, 8, 0, 0, 0],
                        "contours": [{"endPoint": 9, "isClosed": True}],
                    },
                    "components": [],
                    "xAdvance": 369,
                },
            },
            {
                "location": {"WGHT": 1.0},
                "source": {
                    "path": {
                        "coordinates": [
                            135,
                            0,
                            325,
                            0,
                            325,
                            600,
                            170,
                            600,
                            152,
                            600,
                            135,
                            598,
                            119,
                            596,
                            20,
                            582,
                            20,
                            457,
                            135,
                            457,
                        ],
                        "pointTypes": [0, 0, 0, 8, 2, 2, 8, 0, 0, 0],
                        "contours": [{"endPoint": 9, "isClosed": True}],
                    },
                    "components": [],
                    "xAdvance": 450,
                },
            },
        ],
    },
    {
        "axes": {"wght": (0.0, 0.0, 1.0)},
        "name": "uni0031",
        "unicodes": [49],
        "sources": [
            {
                "location": {},
                "source": {
                    "path": {"coordinates": [], "pointTypes": [], "contours": []},
                    "components": [
                        {
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
                            "coord": {"T_H_lo": 0, "X_X_bo": 0},
                        }
                    ],
                    "xAdvance": 350,
                },
            },
            {
                "location": {"wght": 1.0},
                "source": {
                    "path": {"coordinates": [], "pointTypes": [], "contours": []},
                    "components": [
                        {
                            "name": "DC_0031_00",
                            "transform": {
                                "rotation": 0,
                                "scalex": 0.93,
                                "scaley": 1,
                                "tcenterx": 0,
                                "tcentery": 0,
                                "x": -23.0,
                                "y": 0.0,
                            },
                            "coord": {"T_H_lo": 0, "X_X_bo": 0.7},
                        }
                    ],
                    "xAdvance": 350,
                },
            },
        ],
    },
]


@pytest.fixture
def rcjkTestFont():
    return RCJKBackend(dataDir / "figArnaud.rcjk")


@pytest.mark.asyncio
async def test_getGlyphNames(rcjkTestFont):
    glyphNames = await rcjkTestFont.getGlyphNames()
    assert 80 == len(glyphNames)
    assert ["DC_0030_00", "DC_0031_00", "DC_0032_00", "DC_0033_00"] == sorted(
        glyphNames
    )[:4]


@pytest.mark.asyncio
@pytest.mark.parametrize("expectedGlyph", testData)
async def test_getGlyph(rcjkTestFont, expectedGlyph):
    glyphNames = await rcjkTestFont.getGlyphNames()
    glyph = await rcjkTestFont.getGlyph(expectedGlyph["name"])
    assert glyph == expectedGlyph
