import pathlib
import pytest
from fontra.backends import getBackendClass
from fontra.backends.designspace import DesignspaceBackend
from fontra.backends.rcjk import RCJKBackend


dataDir = pathlib.Path(__file__).resolve().parent / "data"

testData = [
    (
        "rcjk",
        {
            "axes": [
                {"defaultValue": 0.0, "maxValue": 1.0, "minValue": 0.0, "name": "HLON"},
                {"defaultValue": 0.0, "maxValue": 1.0, "minValue": 0.0, "name": "WGHT"},
            ],
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
                        "hAdvance": 229,
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
                        "hAdvance": 369,
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
                        "hAdvance": 450,
                    },
                },
            ],
        },
    ),
    (
        "rcjk",
        {
            "axes": [
                {"defaultValue": 0.0, "maxValue": 1.0, "minValue": 0.0, "name": "wght"}
            ],
            "name": "uni0031",
            "unicodes": [49],
            "sources": [
                {
                    "location": {},
                    "source": {
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
                        "hAdvance": 350,
                    },
                },
                {
                    "location": {"wght": 1.0},
                    "source": {
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
                        "hAdvance": 350,
                    },
                },
            ],
        },
    ),
    (
        "rcjk",
        {
            "axes": [
                {
                    "defaultValue": 0.0,
                    "maxValue": 1.0,
                    "minValue": 0.0,
                    "name": "X_X_bo",
                },
                {
                    "defaultValue": 0.0,
                    "maxValue": 1.0,
                    "minValue": 0.0,
                    "name": "X_X_la",
                },
            ],
            "name": "DC_0030_00",
            "unicodes": [],
            "sources": [
                {
                    "location": {},
                    "source": {
                        "components": [
                            {
                                "coord": {"WDTH": 0.33, "WGHT": 0.45},
                                "name": "zero_00",
                                "transform": {
                                    "rotation": 0,
                                    "scalex": 1,
                                    "scaley": 1,
                                    "tcenterx": 0,
                                    "tcentery": 0,
                                    "x": 0,
                                    "y": 0,
                                },
                            }
                        ],
                        "hAdvance": 600,
                    },
                },
                {
                    "location": {"X_X_bo": 1.0},
                    "source": {
                        "components": [
                            {
                                "coord": {"WDTH": 0.33, "WGHT": 1.0},
                                "name": "zero_00",
                                "transform": {
                                    "rotation": 0,
                                    "scalex": 1,
                                    "scaley": 1,
                                    "tcenterx": 0,
                                    "tcentery": 0,
                                    "x": 0,
                                    "y": 0,
                                },
                            }
                        ],
                        "hAdvance": 600,
                    },
                },
                {
                    "location": {"X_X_la": 1.0},
                    "source": {
                        "components": [
                            {
                                "coord": {"WDTH": 1.0, "WGHT": 0.45},
                                "name": "zero_00",
                                "transform": {
                                    "rotation": 0,
                                    "scalex": 1,
                                    "scaley": 1,
                                    "tcenterx": 0,
                                    "tcentery": 0,
                                    "x": 0,
                                    "y": 0,
                                },
                            }
                        ],
                        "hAdvance": 600,
                    },
                },
            ],
        },
    ),
]


testFontPaths = {
    "rcjk": dataDir / "figArnaud.rcjk",
    "designspace": dataDir / "mutatorsans" / "MutatorSans.designspace",
}


def getTestFont(backendName):
    cls = getBackendClass(backendName)
    return cls(testFontPaths[backendName])


getGlyphNamesTestData = [
    ("rcjk", 80, ["DC_0030_00", "DC_0031_00", "DC_0032_00", "DC_0033_00"]),
]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "backendName, numGlyphs, firstFourGlyphNames", getGlyphNamesTestData
)
async def test_getGlyphNames(backendName, numGlyphs, firstFourGlyphNames):
    font = getTestFont(backendName)
    glyphNames = await font.getGlyphNames()
    assert numGlyphs == len(glyphNames)
    assert firstFourGlyphNames == sorted(glyphNames)[:4]


@pytest.mark.asyncio
@pytest.mark.parametrize("backendName, expectedGlyph", testData)
async def test_getGlyph(backendName, expectedGlyph):
    font = getTestFont(backendName)
    glyphNames = await font.getGlyphNames()
    glyph = await font.getGlyph(expectedGlyph["name"])
    assert glyph == expectedGlyph


getBackendTestData = [
    ("rcjk", RCJKBackend),
    ("designspace", DesignspaceBackend),
]


@pytest.mark.parametrize("extension, backendClass", getBackendTestData)
def test_getBackendClass(extension, backendClass):
    cls = getBackendClass(extension)
    assert cls is backendClass


def test_getBackendClassFail():
    with pytest.raises(ValueError):
        cls = getBackendClass("foo")
