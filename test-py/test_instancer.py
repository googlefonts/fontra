import pathlib

import pytest
from fontTools.misc.transform import DecomposedTransform

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
            ({}, LocationCoordinateSystem.NORMALIZED),
            ({"weight": 100}, LocationCoordinateSystem.USER),
            ({"weight": 150}, LocationCoordinateSystem.SOURCE),
            ({"weight": 0}, LocationCoordinateSystem.NORMALIZED),
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
                        skewX=-20.0,
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
            ({"weight": 0.5, "width": 0.5}, LocationCoordinateSystem.NORMALIZED),
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
                        skewX=-20.0,
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
    result = glyphInstancer.instantiate(location, coordSystem=coordSystem)
    result = result.convertToPaths()
    assert expectedResult == result
