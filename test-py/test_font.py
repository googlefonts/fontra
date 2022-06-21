import contextlib
from importlib.metadata import entry_points
import pathlib
import pytest


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
                    "layerName": "foreground",
                }
            ],
            "layers": [
                {
                    "name": "foreground",
                    "glyph": {
                        "xAdvance": 170,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 110, 0, 110, 120, 60, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                {
                    "name": "background",
                    "glyph": {
                        "xAdvance": 170,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [62, 0, 112, 0, 112, 120, 62, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
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
                    "layerName": "foreground",
                }
            ],
            "layers": [
                {
                    "name": "foreground",
                    "glyph": {
                        "components": [
                            {
                                "name": "A",
                                "transformation": {
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
                                "transformation": {
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
                    "layerName": "LightCondensed/foreground",
                },
                {
                    "name": "BoldCondensed",
                    "location": {"weight": 850.0, "width": 0.0},
                    "layerName": "BoldCondensed/foreground",
                },
                {
                    "name": "LightWide",
                    "location": {"weight": 150.0, "width": 1000.0},
                    "layerName": "LightWide/foreground",
                },
                {
                    "name": "BoldWide",
                    "location": {"weight": 850.0, "width": 1000.0},
                    "layerName": "BoldWide/foreground",
                },
            ],
            "layers": [
                {
                    "name": "LightCondensed/foreground",
                    "glyph": {
                        "xAdvance": 170,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 110, 0, 110, 120, 60, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                {
                    "name": "LightCondensed/background",
                    "glyph": {
                        "xAdvance": 170,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [62, 0, 112, 0, 112, 120, 62, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                {
                    "name": "BoldCondensed/foreground",
                    "glyph": {
                        "xAdvance": 250,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [30, 0, 220, 0, 220, 300, 30, 300],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                {
                    "name": "LightWide/foreground",
                    "glyph": {
                        "xAdvance": 290,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [120, 0, 170, 0, 170, 220, 120, 220],
                            "pointTypes": [0, 0, 0, 0],
                        },
                    },
                },
                {
                    "name": "BoldWide/foreground",
                    "glyph": {
                        "xAdvance": 310,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
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
                    "layerName": "LightCondensed/foreground",
                },
                {
                    "name": "BoldCondensed",
                    "location": {"weight": 850.0, "width": 0.0},
                    "layerName": "BoldCondensed/foreground",
                },
                {
                    "name": "LightWide",
                    "location": {"weight": 150.0, "width": 1000.0},
                    "layerName": "LightWide/foreground",
                },
                {
                    "name": "BoldWide",
                    "location": {"weight": 850.0, "width": 1000.0},
                    "layerName": "BoldWide/foreground",
                },
            ],
            "layers": [
                {
                    "name": "LightCondensed/foreground",
                    "glyph": {
                        "components": [
                            {
                                "name": "A",
                                "transformation": {
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
                                "transformation": {
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
                    "name": "BoldCondensed/foreground",
                    "glyph": {
                        "components": [
                            {
                                "name": "A",
                                "transformation": {
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
                                "transformation": {
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
                    "name": "LightWide/foreground",
                    "glyph": {
                        "components": [
                            {
                                "name": "A",
                                "transformation": {
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
                                "transformation": {
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
                    "name": "BoldWide/foreground",
                    "glyph": {
                        "components": [
                            {
                                "name": "A",
                                "transformation": {
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
                                "transformation": {
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
                    "layerName": "foreground",
                },
                {
                    "name": "longbar",
                    "location": {"HLON": 1.0},
                    "layerName": "longbar",
                },
                {
                    "name": "bold",
                    "location": {"WGHT": 1.0},
                    "layerName": "bold",
                },
            ],
            "layers": [
                {
                    "name": "foreground",
                    "glyph": {
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
                            "contourInfo": [{"endPoint": 9, "isClosed": True}],
                        },
                        "xAdvance": 229,
                    },
                },
                {
                    "name": "bold",
                    "glyph": {
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
                            "contourInfo": [{"endPoint": 9, "isClosed": True}],
                        },
                        "xAdvance": 450,
                    },
                },
                {
                    "name": "longbar",
                    "glyph": {
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
                            "contourInfo": [{"endPoint": 9, "isClosed": True}],
                        },
                        "xAdvance": 369,
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
                    "layerName": "foreground",
                },
                {
                    "name": "wght",
                    "location": {"wght": 1.0},
                    "layerName": "wght",
                },
            ],
            "layers": [
                {
                    "name": "foreground",
                    "glyph": {
                        "components": [
                            {
                                "name": "DC_0031_00",
                                "transformation": {
                                    "rotation": 0,
                                    "scalex": 1,
                                    "scaley": 1,
                                    "tcenterx": 0,
                                    "tcentery": 0,
                                    "x": -1,
                                    "y": 0,
                                },
                                "location": {"T_H_lo": 0, "X_X_bo": 0},
                            }
                        ],
                        "xAdvance": 350,
                    },
                },
                {
                    "name": "wght",
                    "glyph": {
                        "components": [
                            {
                                "name": "DC_0031_00",
                                "transformation": {
                                    "rotation": 0,
                                    "scalex": 0.93,
                                    "scaley": 1,
                                    "tcenterx": 0,
                                    "tcentery": 0,
                                    "x": -23.0,
                                    "y": 0.0,
                                },
                                "location": {"T_H_lo": 0, "X_X_bo": 0.7},
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
                    "layerName": "foreground",
                },
                {
                    "name": "X_X_bo",
                    "location": {"X_X_bo": 1.0},
                    "layerName": "X_X_bo_1_layer",
                },
                {
                    "name": "X_X_la",
                    "location": {"X_X_la": 1.0},
                    "layerName": "X_X_la_2_layer",
                },
            ],
            "layers": [
                {
                    "name": "foreground",
                    "glyph": {
                        "components": [
                            {
                                "location": {"WDTH": 0.33, "WGHT": 0.45},
                                "name": "zero_00",
                                "transformation": {
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
                    "name": "X_X_bo_1_layer",
                    "glyph": {
                        "components": [
                            {
                                "location": {"WDTH": 0.33, "WGHT": 1.0},
                                "name": "zero_00",
                                "transformation": {
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
                    "name": "X_X_la_2_layer",
                    "glyph": {
                        "components": [
                            {
                                "location": {"WDTH": 1.0, "WGHT": 0.45},
                                "name": "zero_00",
                                "transformation": {
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
    backendEntryPoints = entry_points(group="fontra.filesystem.backends")
    cls = backendEntryPoints[backendName].load()
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
    with contextlib.closing(font):
        glyphNames = sorted(await font.getReverseCmap())
        assert numGlyphs == len(glyphNames)
        assert firstFourGlyphNames == sorted(glyphNames)[:4]


getReverseCmapTestData = [
    ("rcjk", 80, {"uni0031": [ord("1")]}),
    ("designspace", 49, {"A": [ord("A")], "B": [ord("B")]}),
    ("ufo", 49, {"A": [ord("A")], "B": [ord("B")]}),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("backendName, numGlyphs, testMapping", getReverseCmapTestData)
async def test_getReverseCmap(backendName, numGlyphs, testMapping):
    font = getTestFont(backendName)
    with contextlib.closing(font):
        revCmap = await font.getReverseCmap()
        assert numGlyphs == len(revCmap)
        for glyphName, unicodes in testMapping.items():
            assert revCmap[glyphName] == unicodes


@pytest.mark.asyncio
@pytest.mark.parametrize("backendName, expectedGlyph", getGlyphTestData)
async def test_getGlyph(backendName, expectedGlyph):
    font = getTestFont(backendName)
    with contextlib.closing(font):
        glyph = await font.getGlyph(expectedGlyph["name"])
        assert glyph == expectedGlyph


getGlobalAxesTestData = [
    (
        "rcjk",
        [
            {
                "defaultValue": 400,
                "maxValue": 700,
                "minValue": 400,
                "label": "Weight",
                "name": "wght",
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
                "mapping": [[100.0, 150.0], [900.0, 850.0]],
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


getLibTestData = [
    ("designspace", 0),
    ("ufo", 17),
    ("rcjk", 4),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("backendName, expectedLibLen", getLibTestData)
async def test_getFontLib(backendName, expectedLibLen):
    font = getTestFont(backendName)
    lib = await font.getFontLib()
    assert expectedLibLen == len(lib)
