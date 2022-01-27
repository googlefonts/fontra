import pathlib
import pytest
from fontra.backends import getBackendClass
from fontra.backends.designspace import DesignspaceBackend, UFOBackend
from fontra.backends.rcjk import RCJKBackend


dataDir = pathlib.Path(__file__).resolve().parent / "data"


getGlyphTestData = [
    (
        "ufo",
        {
            "name": "period",
            "unicodes": [ord(".")],
            "sources": [
                {
                    "location": {},
                    "source": {
                        "xAdvance": 170,
                        "path": {
                            "contours": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 110, 0, 110, 120, 60, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                }
            ],
        },
    ),
    (
        "ufo",
        {
            "name": "Aacute",
            "unicodes": [ord("Á")],
            "sources": [
                {
                    "location": {},
                    "source": {
                        "components": [
                            {
                                "name": "A",
                                "transform": {
                                    "rotation": 0.0,
                                    "scalex": 1.0,
                                    "scaley": 1.0,
                                    "tcenterx": 0,
                                    "tcentery": 0,
                                    "x": 0,
                                    "y": 0,
                                },
                            },
                            {
                                "name": "acute",
                                "transform": {
                                    "rotation": 0.0,
                                    "scalex": 1.0,
                                    "scaley": 1.0,
                                    "tcenterx": 0,
                                    "tcentery": 0,
                                    "x": 99,
                                    "y": 20,
                                },
                            },
                        ],
                        "xAdvance": 396,
                    },
                }
            ],
        },
    ),
    (
        "designspace",
        {
            "name": "period",
            "unicodes": [ord(".")],
            "sources": [
                {
                    "name": "LightCondensed",
                    "location": {"weight": 150.0, "width": 0.0},
                    "source": {
                        "xAdvance": 170,
                        "path": {
                            "contours": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 110, 0, 110, 120, 60, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                {
                    "name": "BoldCondensed",
                    "location": {"weight": 850.0, "width": 0.0},
                    "source": {
                        "xAdvance": 250,
                        "path": {
                            "contours": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [30, 0, 220, 0, 220, 300, 30, 300],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                {
                    "name": "LightWide",
                    "location": {"weight": 150.0, "width": 1000.0},
                    "source": {
                        "xAdvance": 290,
                        "path": {
                            "contours": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [120, 0, 170, 0, 170, 220, 120, 220],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                {
                    "name": "BoldWide",
                    "location": {"weight": 850.0, "width": 1000.0},
                    "source": {
                        "xAdvance": 310,
                        "path": {
                            "contours": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 250, 0, 250, 300, 60, 300],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
            ],
        },
    ),
    (
        "designspace",
        {
            "name": "Aacute",
            "unicodes": [ord("Á")],
            "sources": [
                {
                    "name": "LightCondensed",
                    "location": {"weight": 150.0, "width": 0.0},
                    "source": {
                        "components": [
                            {
                                "name": "A",
                                "transform": {
                                    "rotation": 0.0,
                                    "scalex": 1.0,
                                    "scaley": 1.0,
                                    "tcenterx": 0,
                                    "tcentery": 0,
                                    "x": 0,
                                    "y": 0,
                                },
                            },
                            {
                                "name": "acute",
                                "transform": {
                                    "rotation": 0.0,
                                    "scalex": 1.0,
                                    "scaley": 1.0,
                                    "tcenterx": 0,
                                    "tcentery": 0,
                                    "x": 99,
                                    "y": 20,
                                },
                            },
                        ],
                        "xAdvance": 396,
                    },
                },
                {
                    "name": "BoldCondensed",
                    "location": {"weight": 850.0, "width": 0.0},
                    "source": {
                        "components": [
                            {
                                "name": "A",
                                "transform": {
                                    "rotation": 0.0,
                                    "scalex": 1.0,
                                    "scaley": 1.0,
                                    "tcenterx": 0,
                                    "tcentery": 0,
                                    "x": 0,
                                    "y": 0,
                                },
                            },
                            {
                                "name": "acute",
                                "transform": {
                                    "rotation": 0.0,
                                    "scalex": 1.0,
                                    "scaley": 1.0,
                                    "tcenterx": 0,
                                    "tcentery": 0,
                                    "x": 204,
                                    "y": 0,
                                },
                            },
                        ],
                        "xAdvance": 740,
                    },
                },
                {
                    "name": "LightWide",
                    "location": {"weight": 150.0, "width": 1000.0},
                    "source": {
                        "components": [
                            {
                                "name": "A",
                                "transform": {
                                    "rotation": 0.0,
                                    "scalex": 1.0,
                                    "scaley": 1.0,
                                    "tcenterx": 0,
                                    "tcentery": 0,
                                    "x": 0,
                                    "y": 0,
                                },
                            },
                            {
                                "name": "acute",
                                "transform": {
                                    "rotation": 0.0,
                                    "scalex": 1.0,
                                    "scaley": 1.0,
                                    "tcenterx": 0,
                                    "tcentery": 0,
                                    "x": 494,
                                    "y": 20,
                                },
                            },
                        ],
                        "xAdvance": 1190,
                    },
                },
                {
                    "name": "BoldWide",
                    "location": {"weight": 850.0, "width": 1000.0},
                    "source": {
                        "components": [
                            {
                                "name": "A",
                                "transform": {
                                    "rotation": 0.0,
                                    "scalex": 1.0,
                                    "scaley": 1.0,
                                    "tcenterx": 0,
                                    "tcentery": 0,
                                    "x": 0,
                                    "y": 0,
                                },
                            },
                            {
                                "name": "acute",
                                "transform": {
                                    "rotation": 0.0,
                                    "scalex": 1.0,
                                    "scaley": 1.0,
                                    "tcenterx": 0,
                                    "tcentery": 0,
                                    "x": 484,
                                    "y": 20,
                                },
                            },
                        ],
                        "xAdvance": 1290,
                    },
                },
            ],
        },
    ),
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
                    "name": "<default>",
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
                        "xAdvance": 229,
                    },
                },
                {
                    "name": "longbar",
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
                        "xAdvance": 369,
                    },
                },
                {
                    "name": "bold",
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
                        "xAdvance": 450,
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
                    "name": "<default>",
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
                        "xAdvance": 350,
                    },
                },
                {
                    "name": "wght",
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
                        "xAdvance": 350,
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
                    "name": "<default>",
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
                        "xAdvance": 600,
                    },
                },
                {
                    "name": "X_X_bo",
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
                        "xAdvance": 600,
                    },
                },
                {
                    "name": "X_X_la",
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
                        "xAdvance": 600,
                    },
                },
            ],
        },
    ),
]


testFontPaths = {
    "rcjk": dataDir / "figArnaud.rcjk",
    "designspace": dataDir / "mutatorsans" / "MutatorSans.designspace",
    "ufo": dataDir / "mutatorsans" / "MutatorSansLightCondensed.ufo",
}


def getTestFont(backendName):
    cls = getBackendClass(backendName)
    return cls.fromPath(testFontPaths[backendName])


getGlyphNamesTestData = [
    ("rcjk", 80, ["DC_0030_00", "DC_0031_00", "DC_0032_00", "DC_0033_00"]),
    ("designspace", 49, ["A", "Aacute", "Adieresis", "B"]),
    ("ufo", 49, ["A", "Aacute", "Adieresis", "B"]),
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


getReversedCmapTestData = [
    ("rcjk", 80, {"uni0031": [ord("1")]}),
    ("designspace", 49, {"A": [ord("A")], "B": [ord("B")]}),
    ("ufo", 49, {"A": [ord("A")], "B": [ord("B")]}),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("backendName, numGlyphs, testMapping", getReversedCmapTestData)
async def test_getReversedCmap(backendName, numGlyphs, testMapping):
    font = getTestFont(backendName)
    revCmap = await font.getReversedCmap()
    assert numGlyphs == len(revCmap)
    for glyphName, unicodes in testMapping.items():
        assert revCmap[glyphName] == unicodes


@pytest.mark.asyncio
@pytest.mark.parametrize("backendName, expectedGlyph", getGlyphTestData)
async def test_getGlyph(backendName, expectedGlyph):
    font = getTestFont(backendName)
    glyphNames = await font.getGlyphNames()
    glyph = await font.getGlyph(expectedGlyph["name"])
    assert glyph == expectedGlyph


getBackendTestData = [
    ("rcjk", RCJKBackend),
    ("designspace", DesignspaceBackend),
    ("ufo", UFOBackend),
]


@pytest.mark.parametrize("extension, backendClass", getBackendTestData)
def test_getBackendClass(extension, backendClass):
    cls = getBackendClass(extension)
    assert cls is backendClass


def test_getBackendClassFail():
    with pytest.raises(ValueError):
        cls = getBackendClass("foo")


getGlobalAxesTestData = [
    (
        "rcjk",
        [
            {
                "defaultValue": 400,
                "maxValue": 700,
                "minValue": 400,
                "name": "Weight",
                "tag": "wght",
            },
        ],
    ),
    (
        "designspace",
        [
            {"defaultValue": 0.0, "maxValue": 1000.0, "minValue": 0.0, "name": "width"},
            {
                "defaultValue": 100.0,
                "maxValue": 900.0,
                "map": [[100.0, 150.0], [900.0, 850.0]],
                "minValue": 100.0,
                "name": "weight",
            },
        ],
    ),
    ("ufo", []),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("backendName, expectedGlobalAxes", getGlobalAxesTestData)
async def test_getGlobalAxes(backendName, expectedGlobalAxes):
    font = getTestFont(backendName)
    globalAxes = await font.getGlobalAxes()
    assert expectedGlobalAxes == globalAxes
