import pathlib

import pytest
from fontTools.misc.transform import DecomposedTransform
from fontTools.pens.recordingPen import RecordingPointPen

from fontra.backends import getFileSystemBackend
from fontra.core.classes import Component, StaticGlyph
from fontra.core.instancer import FontInstancer, LocationCoordinateSystem
from fontra.core.path import Contour, Path

commonFontsDir = pathlib.Path(__file__).parent.parent / "test-common" / "fonts"


@pytest.fixture
def testFont():
    return getFileSystemBackend(commonFontsDir / "MutatorSans.fontra")


@pytest.fixture
def instancer(testFont):
    return FontInstancer(testFont)


testData = [
    (
        "period",
        [({}, LocationCoordinateSystem.SOURCE)],
        StaticGlyph(
            xAdvance=170,
            path=Path(
                contours=[
                    Contour(
                        points=[
                            {"x": 60.0, "y": 0.0},
                            {"x": 110.0, "y": 0.0},
                            {"x": 110.0, "y": 120.0},
                            {"x": 60.0, "y": 120.0},
                        ],
                        isClosed=True,
                    )
                ]
            ),
        ),
    ),
    (
        "period",
        [({"weight": 500}, LocationCoordinateSystem.SOURCE)],
        StaticGlyph(
            xAdvance=210,
            path=Path(
                contours=[
                    Contour(
                        points=[
                            {"x": 45.0, "y": 0.0},
                            {"x": 165.0, "y": 0.0},
                            {"x": 165.0, "y": 210.0},
                            {"x": 45.0, "y": 210.0},
                        ],
                        isClosed=True,
                    )
                ]
            ),
        ),
    ),
    (
        "Aacute",
        [
            ({}, LocationCoordinateSystem.USER),
            ({}, LocationCoordinateSystem.SOURCE),
            ({"weight": 100}, LocationCoordinateSystem.USER),
            ({"weight": 150}, LocationCoordinateSystem.SOURCE),
        ],
        StaticGlyph(
            xAdvance=396,
            components=[
                Component(
                    name="A",
                    transformation=DecomposedTransform(),
                    location={},
                ),
                Component(
                    name="acute",
                    transformation=DecomposedTransform(
                        translateX=99.0, translateY=20.0
                    ),
                    location={},
                ),
            ],
        ),
    ),
    (
        "varcotest1",
        [({}, LocationCoordinateSystem.SOURCE)],
        StaticGlyph(
            xAdvance=900,
            components=[
                Component(
                    name="A",
                    transformation=DecomposedTransform(
                        rotation=-10.0, skewY=20.0, tCenterX=250.0, tCenterY=300.0
                    ),
                    location={"weight": 500.0, "unknown-axis": 0},
                ),
                Component(
                    name="varcotest2",
                    transformation=DecomposedTransform(
                        translateX=527.0,
                        translateY=410.0,
                        scaleX=0.5,
                        scaleY=0.5,
                        skewX=20.0,
                    ),
                    location={"flip": 70.0, "flop": 30.0},
                ),
                Component(
                    name="varcotest2",
                    transformation=DecomposedTransform(
                        translateX=627.0,
                        translateY=-175.0,
                        rotation=10.0,
                        scaleX=0.75,
                        scaleY=0.75,
                        skewY=20.0,
                    ),
                    location={"flip": 20.0, "flop": 80.0},
                ),
            ],
        ),
    ),
    (
        "varcotest1",
        [
            ({"weight": 500, "width": 500}, LocationCoordinateSystem.USER),
            ({"weight": 500, "width": 500}, LocationCoordinateSystem.SOURCE),
        ],
        StaticGlyph(
            xAdvance=900,
            components=[
                Component(
                    name="A",
                    transformation=DecomposedTransform(
                        rotation=-10.0, skewY=20.0, tCenterX=250.0, tCenterY=300.0
                    ),
                    location={"weight": 300.0, "unknown-axis": 100},
                ),
                Component(
                    name="varcotest2",
                    transformation=DecomposedTransform(
                        translateX=527.0,
                        translateY=410.0,
                        scaleX=0.5,
                        scaleY=0.5,
                        skewX=20.0,
                    ),
                    location={"flip": 70.0, "flop": 30.0},
                ),
                Component(
                    name="varcotest2",
                    transformation=DecomposedTransform(
                        translateX=627.0,
                        translateY=-175.0,
                        rotation=10.0,
                        scaleX=0.75,
                        scaleY=0.75,
                        skewY=20.0,
                    ),
                    location={"flip": 20.0, "flop": 80.0},
                ),
            ],
        ),
    ),
]

testData = [
    (glyphName, location, coordSystem, expectedResult)
    for glyphName, locations, expectedResult in testData
    for location, coordSystem in locations
]


@pytest.mark.parametrize("glyphName, location, coordSystem, expectedResult", testData)
async def test_instancer(instancer, glyphName, location, coordSystem, expectedResult):
    glyphInstancer = await instancer.getGlyphInstancer(glyphName)
    instance = glyphInstancer.instantiate(location, coordSystem=coordSystem)
    result = instance.glyph.convertToPaths()
    assert expectedResult == result


penTestData = [
    (
        "period",
        {"weight": 500},
        False,
        False,
        [
            ("beginPath", (), {}),
            ("addPoint", ((45.0, 0.0), "line", False, None), {}),
            ("addPoint", ((165.0, 0.0), "line", False, None), {}),
            ("addPoint", ((165.0, 210.0), "line", False, None), {}),
            ("addPoint", ((45.0, 210.0), "line", False, None), {}),
            ("endPath", (), {}),
        ],
    ),
    (
        "Aacute",
        {},
        False,
        False,
        [
            ("addComponent", ("A", (1, 0, 0, 1, 0, 0)), {}),
            ("addComponent", ("acute", (1, 0, 0, 1, 99, 20)), {}),
        ],
    ),
    (
        "dieresis",
        {},
        False,
        False,
        [
            ("addComponent", ("dot", (1, 0, 0, 1, 0, -10)), {}),
            ("addComponent", ("dot", (1, 0, 0, 1, 80, -10)), {}),
        ],
    ),
    (
        "dieresis",
        {},
        True,
        False,
        [
            ("beginPath", (), {}),
            ("addPoint", ((50.0, 720.0), "line", False, None), {}),
            ("addPoint", ((90.0, 720.0), "line", False, None), {}),
            ("addPoint", ((90.0, 780.0), "line", False, None), {}),
            ("addPoint", ((50.0, 780.0), "line", False, None), {}),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            ("addPoint", ((130.0, 720.0), "line", False, None), {}),
            ("addPoint", ((170.0, 720.0), "line", False, None), {}),
            ("addPoint", ((170.0, 780.0), "line", False, None), {}),
            ("addPoint", ((130.0, 780.0), "line", False, None), {}),
            ("endPath", (), {}),
        ],
    ),
    (
        "dieresis",
        {"weight": 500},
        True,
        False,
        [
            ("beginPath", (), {}),
            ("addPoint", ((50.0, 775.0), "line", False, None), {}),
            ("addPoint", ((165.0, 775.0), "line", False, None), {}),
            ("addPoint", ((165.0, 867.5), "line", False, None), {}),
            ("addPoint", ((50.0, 867.5), "line", False, None), {}),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            ("addPoint", ((205.0, 775.0), "line", False, None), {}),
            ("addPoint", ((320.0, 775.0), "line", False, None), {}),
            ("addPoint", ((320.0, 867.5), "line", False, None), {}),
            ("addPoint", ((205.0, 867.5), "line", False, None), {}),
            ("endPath", (), {}),
        ],
    ),
    (
        "varcotest1",
        {"weight": 500},
        False,
        False,
        [
            (
                "addVarComponent",
                (
                    "A",
                    DecomposedTransform(
                        rotation=-10.0,
                        skewY=20.0,
                        tCenterX=250.0,
                        tCenterY=300.0,
                    ),
                    {"unknown-axis": 100.0, "weight": 300.0, "width": 0.0},
                ),
                {},
            ),
            (
                "addVarComponent",
                (
                    "varcotest2",
                    DecomposedTransform(
                        translateX=527.0,
                        translateY=410.0,
                        scaleX=0.5,
                        scaleY=0.5,
                        skewX=20.0,
                    ),
                    {"flip": 70.0, "flop": 30.0, "weight": 500.0, "width": 0.0},
                ),
                {},
            ),
            (
                "addVarComponent",
                (
                    "varcotest2",
                    DecomposedTransform(
                        translateX=627.0,
                        translateY=-175.0,
                        rotation=10.0,
                        scaleX=0.75,
                        scaleY=0.75,
                        skewY=20.0,
                    ),
                    {"flip": 20.0, "flop": 80.0, "weight": 500.0, "width": 0.0},
                ),
                {},
            ),
        ],
    ),
    (
        "varcotest1",
        {"weight": 500},
        True,
        False,
        [
            ("beginPath", (), {}),
            (
                "addPoint",
                ((-49.87408360272606, -39.1325599959878), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((41.45254750580243, -23.029210874345203), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((300.87265092867585, 711.0926834687576), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((220.400414501079, 696.9032569886217), "line", False, None),
                {},
            ),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            (
                "addPoint",
                ((49.2048313370356, 125.82806642121722), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((360.6136718382474, 180.7378470327198), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((373.339602572981, 252.91018664632878), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((61.93076207176921, 198.00040603482617), "line", False, None),
                {},
            ),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            (
                "addPoint",
                ((296.86768303227717, 22.007368800281462), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((409.4539561365614, 41.85936640597855), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((389.2798241575054, 726.6812533971674), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((285.3022089036152, 708.3471944381826), "line", False, None),
                {},
            ),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            (
                "addPoint",
                ((236.09639069942705, 617.269854437116), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((335.4328165035396, 634.7855464735256), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((350.4285769892052, 719.8307302872228), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((251.0921511850927, 702.3150382508131), "line", False, None),
                {},
            ),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            ("addPoint", ((599.4343385942789, 512.85), "line", False, None), {}),
            ("addPoint", ((768.9843385942789, 512.85), "line", False, None), {}),
            ("addPoint", ((793.2999518602035, 546.0), "line", False, None), {}),
            ("addPoint", ((822.5468205418553, 563.85), "line", False, None), {}),
            ("addPoint", ((887.3881177763792, 742.0), "line", False, None), {}),
            ("addPoint", ((749.8381177763792, 742.0), "line", False, None), {}),
            ("addPoint", ((736.0072488742635, 704.0), "line", False, None), {}),
            ("addPoint", ((669.0072488742635, 704.0), "line", False, None), {}),
            ("endPath", (), {}),
            ("beginPath", (), {}),
            (
                "addPoint",
                ((664.2881431651941, -84.13611805502723), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((849.2542636761442, 22.65412141293052), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((842.1370128155872, 93.2516018605703), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((884.354439802735, 125.92658104585712), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((822.2578514690408, 478.0938335230227), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((681.5287702432207, 396.84386059448684), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((691.4267163702358, 340.709818672791), "line", False, None),
                {},
            ),
            (
                "addPoint",
                ((598.8054153669947, 287.23488560587646), "line", False, None),
                {},
            ),
            ("endPath", (), {}),
        ],
    ),
]


@pytest.mark.parametrize(
    "glyphName, location, flattenComponents, flattenVarComponents, expectedResult",
    penTestData,
)
async def test_drawPoints(
    instancer,
    glyphName,
    location,
    flattenComponents,
    flattenVarComponents,
    expectedResult,
):
    glyphInstancer = await instancer.getGlyphInstancer(glyphName)
    pen = RecordingPointPen()
    _ = await glyphInstancer.drawPoints(
        pen,
        location,
        flattenComponents=flattenComponents,
        flattenVarComponents=flattenVarComponents,
    )
    assert expectedResult == pen.value
