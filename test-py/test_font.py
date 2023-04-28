import contextlib
import pathlib
from dataclasses import asdict
from importlib.metadata import entry_points

import pytest

dataDir = pathlib.Path(__file__).resolve().parent / "data"


getGlyphTestData = [
    (
        "ufo",
        {
            "name": "period",
            "axes": [],
            "sources": [
                {
                    "location": {},
                    "layerName": "default/foreground",
                    "name": "default",
                    "active": True,
                    "customData": {},
                }
            ],
            "layers": {
                "default/foreground": {
                    "glyph": {
                        "xAdvance": 170,
                        "yAdvance": None,
                        "verticalOrigin": None,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 110, 0, 110, 120, 60, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "components": [],
                    },
                    "customData": {},
                },
                "default/background": {
                    "glyph": {
                        "xAdvance": 170,
                        "yAdvance": None,
                        "verticalOrigin": None,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [62, 0, 112, 0, 112, 120, 62, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "components": [],
                    },
                    "customData": {},
                },
            },
            "customData": {},
        },
    ),
    (
        "ufo",
        {
            "name": "Aacute",
            "axes": [],
            "sources": [
                {
                    "location": {},
                    "layerName": "default/foreground",
                    "name": "default",
                    "active": True,
                    "customData": {},
                }
            ],
            "layers": {
                "default/foreground": {
                    "glyph": {
                        "path": {
                            "contourInfo": [],
                            "coordinates": [],
                            "pointTypes": [],
                        },
                        "components": [
                            {
                                "name": "A",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 0,
                                    "translateY": 0,
                                },
                            },
                            {
                                "name": "acute",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 99,
                                    "translateY": 20,
                                },
                            },
                        ],
                        "xAdvance": 396,
                        "yAdvance": None,
                        "verticalOrigin": None,
                    },
                    "customData": {},
                },
            },
            "customData": {},
        },
    ),
    (
        "designspace",
        {
            "name": "period",
            "axes": [],
            "sources": [
                {
                    "name": "LightCondensed",
                    "location": {"weight": 150.0, "width": 0.0},
                    "layerName": "LightCondensed/foreground",
                    "active": True,
                    "customData": {},
                },
                {
                    "name": "BoldCondensed",
                    "location": {"weight": 850.0, "width": 0.0},
                    "layerName": "BoldCondensed/foreground",
                    "active": True,
                    "customData": {},
                },
                {
                    "name": "LightWide",
                    "location": {"weight": 150.0, "width": 1000.0},
                    "layerName": "LightWide/foreground",
                    "active": True,
                    "customData": {},
                },
                {
                    "name": "BoldWide",
                    "location": {"weight": 850.0, "width": 1000.0},
                    "layerName": "BoldWide/foreground",
                    "active": True,
                    "customData": {},
                },
            ],
            "layers": {
                "LightCondensed/foreground": {
                    "glyph": {
                        "xAdvance": 170,
                        "yAdvance": None,
                        "verticalOrigin": None,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 110, 0, 110, 120, 60, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "components": [],
                    },
                    "customData": {},
                },
                "LightCondensed/background": {
                    "glyph": {
                        "xAdvance": 170,
                        "yAdvance": None,
                        "verticalOrigin": None,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [62, 0, 112, 0, 112, 120, 62, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "components": [],
                    },
                    "customData": {},
                },
                "BoldCondensed/foreground": {
                    "glyph": {
                        "xAdvance": 250,
                        "yAdvance": None,
                        "verticalOrigin": None,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [30, 0, 220, 0, 220, 300, 30, 300],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "components": [],
                    },
                    "customData": {},
                },
                "LightWide/foreground": {
                    "glyph": {
                        "xAdvance": 290,
                        "yAdvance": None,
                        "verticalOrigin": None,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [120, 0, 170, 0, 170, 220, 120, 220],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "components": [],
                    },
                    "customData": {},
                },
                "BoldWide/foreground": {
                    "glyph": {
                        "xAdvance": 310,
                        "yAdvance": None,
                        "verticalOrigin": None,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 250, 0, 250, 300, 60, 300],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "components": [],
                    },
                    "customData": {},
                },
            },
            "customData": {},
        },
    ),
    (
        "designspace",
        {
            "name": "Aacute",
            "axes": [],
            "sources": [
                {
                    "name": "LightCondensed",
                    "location": {"weight": 150.0, "width": 0.0},
                    "layerName": "LightCondensed/foreground",
                    "active": True,
                    "customData": {},
                },
                {
                    "name": "BoldCondensed",
                    "location": {"weight": 850.0, "width": 0.0},
                    "layerName": "BoldCondensed/foreground",
                    "active": True,
                    "customData": {},
                },
                {
                    "name": "LightWide",
                    "location": {"weight": 150.0, "width": 1000.0},
                    "layerName": "LightWide/foreground",
                    "active": True,
                    "customData": {},
                },
                {
                    "name": "BoldWide",
                    "location": {"weight": 850.0, "width": 1000.0},
                    "layerName": "BoldWide/foreground",
                    "active": True,
                    "customData": {},
                },
            ],
            "layers": {
                "LightCondensed/foreground": {
                    "glyph": {
                        "path": {
                            "contourInfo": [],
                            "coordinates": [],
                            "pointTypes": [],
                        },
                        "components": [
                            {
                                "name": "A",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 0,
                                    "translateY": 0,
                                },
                            },
                            {
                                "name": "acute",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 99,
                                    "translateY": 20,
                                },
                            },
                        ],
                        "xAdvance": 396,
                        "yAdvance": None,
                        "verticalOrigin": None,
                    },
                    "customData": {},
                },
                "BoldCondensed/foreground": {
                    "glyph": {
                        "path": {
                            "contourInfo": [],
                            "coordinates": [],
                            "pointTypes": [],
                        },
                        "components": [
                            {
                                "name": "A",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 0,
                                    "translateY": 0,
                                },
                            },
                            {
                                "name": "acute",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 204,
                                    "translateY": 0,
                                },
                            },
                        ],
                        "xAdvance": 740,
                        "yAdvance": None,
                        "verticalOrigin": None,
                    },
                    "customData": {},
                },
                "LightWide/foreground": {
                    "glyph": {
                        "path": {
                            "contourInfo": [],
                            "coordinates": [],
                            "pointTypes": [],
                        },
                        "components": [
                            {
                                "name": "A",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 0,
                                    "translateY": 0,
                                },
                            },
                            {
                                "name": "acute",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 494,
                                    "translateY": 20,
                                },
                            },
                        ],
                        "xAdvance": 1190,
                        "yAdvance": None,
                        "verticalOrigin": None,
                    },
                    "customData": {},
                },
                "BoldWide/foreground": {
                    "glyph": {
                        "path": {
                            "contourInfo": [],
                            "coordinates": [],
                            "pointTypes": [],
                        },
                        "components": [
                            {
                                "name": "A",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 0,
                                    "translateY": 0,
                                },
                            },
                            {
                                "name": "acute",
                                "location": {},
                                "transformation": {
                                    "rotation": 0.0,
                                    "scaleX": 1.0,
                                    "scaleY": 1.0,
                                    "skewX": 0,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                    "translateX": 484,
                                    "translateY": 20,
                                },
                            },
                        ],
                        "xAdvance": 1290,
                        "yAdvance": None,
                        "verticalOrigin": None,
                    },
                    "customData": {},
                },
            },
            "customData": {},
        },
    ),
    (
        "designspace",
        {
            "name": "varcotest1",
            "axes": [],
            "sources": [
                {
                    "name": "LightCondensed",
                    "location": {"weight": 150.0, "width": 0.0},
                    "layerName": "LightCondensed/foreground",
                    "active": True,
                    "customData": {},
                },
            ],
            "layers": {
                "LightCondensed/foreground": {
                    "glyph": {
                        "path": {
                            "contourInfo": [],
                            "coordinates": [],
                            "pointTypes": [],
                        },
                        "components": [
                            {
                                "name": "A",
                                "location": {"weight": 500},
                                "transformation": {
                                    "translateX": 0,
                                    "translateY": 0,
                                    "rotation": -10,
                                    "scaleX": 1,
                                    "scaleY": 1,
                                    "skewX": 0,
                                    "skewY": 20,
                                    "tCenterX": 250,
                                    "tCenterY": 300,
                                },
                            },
                            {
                                "name": "varcotest2",
                                "location": {"flip": 70, "flop": 30},
                                "transformation": {
                                    "translateX": 527,
                                    "translateY": 410,
                                    "rotation": 0,
                                    "scaleX": 0.5,
                                    "scaleY": 0.5,
                                    "skewX": -20,
                                    "skewY": 0,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                },
                            },
                            {
                                "name": "varcotest2",
                                "location": {"flip": 20, "flop": 80},
                                "transformation": {
                                    "translateX": 627,
                                    "translateY": -175,
                                    "rotation": 10,
                                    "scaleX": 0.75,
                                    "scaleY": 0.75,
                                    "skewX": 0,
                                    "skewY": 20,
                                    "tCenterX": 0,
                                    "tCenterY": 0,
                                },
                            },
                        ],
                        "xAdvance": 900,
                        "yAdvance": None,
                        "verticalOrigin": None,
                    },
                    "customData": {},
                },
            },
            "customData": {},
        },
    ),
    (
        "designspace",
        {
            "name": "varcotest2",
            "axes": [
                {"defaultValue": 0, "maxValue": 100, "minValue": 0, "name": "flip"},
                {"defaultValue": 0, "maxValue": 100, "minValue": 0, "name": "flop"},
            ],
            "sources": [
                {
                    "layerName": "LightCondensed/foreground",
                    "location": {"flip": 0, "flop": 0},
                    "name": "LightCondensed/foreground",
                    "active": True,
                    "customData": {},
                },
                {
                    "layerName": "LightCondensed/varco_flip",
                    "location": {"flip": 100, "flop": 0},
                    "name": "LightCondensed/varco_flip",
                    "active": True,
                    "customData": {},
                },
                {
                    "layerName": "LightCondensed/varco_flop",
                    "location": {"flip": 0, "flop": 100},
                    "name": "LightCondensed/varco_flop",
                    "active": True,
                    "customData": {},
                },
            ],
            "layers": {
                "LightCondensed/foreground": {
                    "glyph": {
                        "components": [],
                        "path": {
                            "contourInfo": [{"endPoint": 7, "isClosed": True}],
                            "coordinates": [
                                70,
                                278,
                                309,
                                278,
                                309,
                                380,
                                379,
                                380,
                                379,
                                664,
                                204,
                                664,
                                204,
                                588,
                                70,
                                588,
                            ],
                            "pointTypes": [0, 0, 0, 0, 0, 0, 0, 0],
                        },
                        "verticalOrigin": None,
                        "xAdvance": 500,
                        "yAdvance": None,
                    },
                    "customData": {},
                },
                "LightCondensed/varco_flip": {
                    "glyph": {
                        "components": [],
                        "path": {
                            "contourInfo": [{"endPoint": 7, "isClosed": True}],
                            "coordinates": [
                                70,
                                278,
                                452,
                                278,
                                452,
                                380,
                                522,
                                380,
                                522,
                                664,
                                204,
                                664,
                                204,
                                588,
                                70,
                                588,
                            ],
                            "pointTypes": [0, 0, 0, 0, 0, 0, 0, 0],
                        },
                        "verticalOrigin": None,
                        "xAdvance": 500,
                        "yAdvance": None,
                    },
                    "customData": {},
                },
                "LightCondensed/varco_flop": {
                    "glyph": {
                        "components": [],
                        "path": {
                            "contourInfo": [{"endPoint": 7, "isClosed": True}],
                            "coordinates": [
                                70,
                                37,
                                309,
                                37,
                                309,
                                139,
                                379,
                                139,
                                379,
                                664,
                                204,
                                664,
                                204,
                                588,
                                70,
                                588,
                            ],
                            "pointTypes": [0, 0, 0, 0, 0, 0, 0, 0],
                        },
                        "verticalOrigin": None,
                        "xAdvance": 500,
                        "yAdvance": None,
                    },
                    "customData": {},
                },
            },
            "customData": {},
        },
    ),
    (
        "ttf",
        {
            "name": "period",
            "axes": [],
            "layers": {
                "<default>": {
                    "glyph": {
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 60, 120, 110, 120, 110, 0],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "components": [],
                        "xAdvance": 170,
                        "yAdvance": None,
                        "verticalOrigin": None,
                    },
                    "customData": {},
                },
                "wdth=1": {
                    "glyph": {
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [120, 0, 120, 220, 170, 220, 170, 0],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "components": [],
                        "xAdvance": 290,
                        "yAdvance": None,
                        "verticalOrigin": None,
                    },
                    "customData": {},
                },
                "wdth=1,wght=1": {
                    "glyph": {
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 60, 300, 250, 300, 250, 0],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "components": [],
                        "xAdvance": 310,
                        "yAdvance": None,
                        "verticalOrigin": None,
                    },
                    "customData": {},
                },
                "wght=1": {
                    "glyph": {
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [30, 0, 30, 300, 220, 300, 220, 0],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "components": [],
                        "xAdvance": 250,
                        "yAdvance": None,
                        "verticalOrigin": None,
                    },
                    "customData": {},
                },
            },
            "sources": [
                {
                    "layerName": "<default>",
                    "location": {"wdth": 0, "wght": 0},
                    "name": "<default>",
                    "active": True,
                    "customData": {},
                },
                {
                    "layerName": "wdth=1",
                    "location": {"wdth": 1.0, "wght": 0},
                    "name": "wdth=1",
                    "active": True,
                    "customData": {},
                },
                {
                    "layerName": "wdth=1,wght=1",
                    "location": {"wdth": 1.0, "wght": 1.0},
                    "name": "wdth=1,wght=1",
                    "active": True,
                    "customData": {},
                },
                {
                    "layerName": "wght=1",
                    "location": {"wdth": 0, "wght": 1.0},
                    "name": "wght=1",
                    "active": True,
                    "customData": {},
                },
            ],
            "customData": {},
        },
    ),
    (
        "otf",
        {
            "name": "period",
            "axes": [],
            "layers": {
                "<default>": {
                    "glyph": {
                        "path": {
                            "coordinates": [60, 0, 110, 0, 110, 120, 60, 120],
                            "pointTypes": [0, 0, 0, 0],
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                        },
                        "components": [],
                        "xAdvance": 170,
                        "yAdvance": None,
                        "verticalOrigin": None,
                    },
                    "customData": {},
                },
                "wdth=1": {
                    "glyph": {
                        "path": {
                            "coordinates": [
                                120.0,
                                0,
                                170.0,
                                0,
                                170.0,
                                220.0,
                                120.0,
                                220.0,
                            ],
                            "pointTypes": [0, 0, 0, 0],
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                        },
                        "components": [],
                        "xAdvance": 290.0,
                        "yAdvance": None,
                        "verticalOrigin": None,
                    },
                    "customData": {},
                },
                "wdth=1,wght=1": {
                    "glyph": {
                        "path": {
                            "coordinates": [
                                60.0,
                                0,
                                250.0,
                                0,
                                250.0,
                                300.0,
                                60.0,
                                300.0,
                            ],
                            "pointTypes": [0, 0, 0, 0],
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                        },
                        "components": [],
                        "xAdvance": 310.0,
                        "yAdvance": None,
                        "verticalOrigin": None,
                    },
                    "customData": {},
                },
                "wght=1": {
                    "glyph": {
                        "path": {
                            "coordinates": [
                                30.0,
                                0,
                                220.0,
                                0,
                                220.0,
                                300.0,
                                30.0,
                                300.0,
                            ],
                            "pointTypes": [0, 0, 0, 0],
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                        },
                        "components": [],
                        "xAdvance": 250.0,
                        "yAdvance": None,
                        "verticalOrigin": None,
                    },
                    "customData": {},
                },
            },
            "sources": [
                {
                    "location": {"wdth": 0, "wght": 0},
                    "name": "<default>",
                    "layerName": "<default>",
                    "active": True,
                    "customData": {},
                },
                {
                    "location": {"wdth": 1.0, "wght": 0},
                    "name": "wdth=1",
                    "layerName": "wdth=1",
                    "active": True,
                    "customData": {},
                },
                {
                    "location": {"wdth": 1.0, "wght": 1.0},
                    "name": "wdth=1,wght=1",
                    "layerName": "wdth=1,wght=1",
                    "active": True,
                    "customData": {},
                },
                {
                    "location": {"wdth": 0, "wght": 1.0},
                    "name": "wght=1",
                    "layerName": "wght=1",
                    "active": True,
                    "customData": {},
                },
            ],
            "customData": {},
        },
    ),
]


testFontPaths = {
    "designspace": dataDir / "mutatorsans" / "MutatorSans.designspace",
    "ufo": dataDir / "mutatorsans" / "MutatorSansLightCondensed.ufo",
    "ttf": dataDir / "mutatorsans" / "MutatorSans.ttf",
    "otf": dataDir / "mutatorsans" / "MutatorSans.otf",
}


def getTestFont(backendName):
    backendEntryPoints = entry_points(group="fontra.filesystem.backends")
    cls = backendEntryPoints[backendName].load()
    return cls.fromPath(testFontPaths[backendName])


getGlyphNamesTestData = [
    ("designspace", 51, ["A", "Aacute", "Adieresis", "B"]),
    ("ufo", 51, ["A", "Aacute", "Adieresis", "B"]),
]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "backendName, numGlyphs, firstFourGlyphNames", getGlyphNamesTestData
)
async def test_getGlyphNames(backendName, numGlyphs, firstFourGlyphNames):
    font = getTestFont(backendName)
    with contextlib.closing(font):
        glyphNames = sorted(await font.getGlyphMap())
        assert numGlyphs == len(glyphNames)
        assert firstFourGlyphNames == sorted(glyphNames)[:4]


getGlyphMapTestData = [
    (
        "designspace",
        51,
        {"A": [ord("A"), ord("a")], "B": [ord("B"), ord("b")], "I.narrow": []},
    ),
    ("ufo", 51, {"A": [ord("A"), ord("a")], "B": [ord("B"), ord("b")], "I.narrow": []}),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("backendName, numGlyphs, testMapping", getGlyphMapTestData)
async def test_getGlyphMap(backendName, numGlyphs, testMapping):
    font = getTestFont(backendName)
    with contextlib.closing(font):
        glyphMap = await font.getGlyphMap()
        assert numGlyphs == len(glyphMap)
        for glyphName, unicodes in testMapping.items():
            assert glyphMap[glyphName] == unicodes


@pytest.mark.asyncio
@pytest.mark.parametrize("backendName, expectedGlyph", getGlyphTestData)
async def test_getGlyph(backendName, expectedGlyph):
    font = getTestFont(backendName)
    with contextlib.closing(font):
        glyph = await font.getGlyph(expectedGlyph["name"])
        glyph = asdict(glyph)
        assert glyph == expectedGlyph


getGlobalAxesTestData = [
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
    ("ufo", 0),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("backendName, expectedLibLen", getLibTestData)
async def test_getFontLib(backendName, expectedLibLen):
    font = getTestFont(backendName)
    lib = await font.getFontLib()
    assert expectedLibLen == len(lib)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "backendName, expectedUnitsPerEm",
    [
        ("designspace", 1000),
        ("ufo", 1000),
        ("ttf", 1000),
    ],
)
async def test_getUnitsPerEm(backendName, expectedUnitsPerEm):
    font = getTestFont(backendName)
    unitsPerEm = await font.getUnitsPerEm()
    assert expectedUnitsPerEm == unitsPerEm


@pytest.mark.asyncio
async def test_cff2InterpolationCompatibility():
    # Test the workaround for https://github.com/fonttools/fonttools/issues/2838
    font = getTestFont("otf")
    glyph = await font.getGlyph("S")
    layers = list(glyph.layers.values())
    firstPointTypes = layers[0].glyph.path.pointTypes
    for layer in layers:
        assert layer.glyph.path.pointTypes == firstPointTypes
