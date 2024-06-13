import pathlib

import pytest

from fontra.backends import getFileSystemBackend
from fontra.core.classes import Axes, CrossAxisMapping, FontAxis

dataDir = pathlib.Path(__file__).resolve().parent / "data"


@pytest.fixture
def testFontAvar2():
    return getFileSystemBackend(dataDir / "avar2" / "DemoAvar2.ttf")


@pytest.fixture
def testFontAvar2NLI():
    return getFileSystemBackend(dataDir / "avar2" / "DemoAvar2-NLI.ttf")


expectedAxes = Axes(
    axes=[
        FontAxis(
            name="DIAG",
            label="Diagonal",
            tag="DIAG",
            minValue=0.0,
            defaultValue=0.0,
            maxValue=100.0,
            mapping=[[0.0, 0.0], [100.0, 1.0]],
            valueLabels=[],
            hidden=False,
            customData={},
        ),
        FontAxis(
            name="HORI",
            label="Horizontal",
            tag="HORI",
            minValue=0.0,
            defaultValue=0.0,
            maxValue=100.0,
            mapping=[[0.0, 0.0], [100.0, 1.0]],
            valueLabels=[],
            hidden=True,
            customData={},
        ),
        FontAxis(
            name="VERT",
            label="Vertical",
            tag="VERT",
            minValue=0.0,
            defaultValue=0.0,
            maxValue=100.0,
            mapping=[[0.0, 0.0], [100.0, 1.0]],
            valueLabels=[],
            hidden=True,
            customData={},
        ),
    ],
    mappings=[
        CrossAxisMapping(
            description=None,
            groupDescription=None,
            inputLocation={
                "DIAG": 0.25,
            },
            outputLocation={
                "HORI": 0.0,
                "VERT": 0.33001708984375,
            },
        ),
        CrossAxisMapping(
            description=None,
            groupDescription=None,
            inputLocation={
                "DIAG": 0.75,
            },
            outputLocation={
                "HORI": 1.0,
                "VERT": 0.6700032552083334,
            },
        ),
        CrossAxisMapping(
            description=None,
            groupDescription=None,
            inputLocation={
                "DIAG": 1.0,
            },
            outputLocation={
                "HORI": 1.0,
                "VERT": 1.0,
            },
        ),
    ],
    elidedFallBackname=None,
    customData={},
)


async def test_readAvar2(testFontAvar2):
    axes = await testFontAvar2.getAxes()
    assert expectedAxes == axes


expectedAxesNLI = Axes(
    axes=[
        FontAxis(
            name="BEND",
            label="Bend",
            tag="BEND",
            minValue=0.0,
            defaultValue=0.0,
            maxValue=100.0,
            mapping=[[0.0, 0.0], [100.0, 1.0]],
            valueLabels=[],
            hidden=False,
            customData={},
        ),
        FontAxis(
            name="BND2",
            label="Bend-2",
            tag="BND2",
            minValue=0.0,
            defaultValue=0.0,
            maxValue=100.0,
            mapping=[[0.0, 0.0], [100.0, 1.0]],
            valueLabels=[],
            hidden=True,
            customData={},
        ),
    ],
    mappings=[
        CrossAxisMapping(
            description=None,
            groupDescription=None,
            inputLocation={"BEND": 1.0},
            outputLocation={"BND2": 1.0},
        )
    ],
    elidedFallBackname=None,
    customData={},
)


async def test_readAvar2NLI(testFontAvar2NLI):
    axes = await testFontAvar2NLI.getAxes()
    assert expectedAxesNLI == axes
