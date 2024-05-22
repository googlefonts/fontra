import pathlib

import pytest

from fontra.backends import getFileSystemBackend
from fontra.core.classes import Axes, FontAxis

dataDir = pathlib.Path(__file__).resolve().parent / "data"


def getTestFontAvar2():
    return getFileSystemBackend(dataDir / "avar2" / "DemoAvar2.ttf")


@pytest.fixture
def testFontAvar2():
    return getTestFontAvar2()


expectedAxes = Axes(
    axes=[
        FontAxis(
            name="DIAG",
            label="DIAG",
            tag="DIAG",
            minValue=0.0,
            defaultValue=0.0,
            maxValue=100.0,
            mapping=[(0.0, 0.0), (100.0, 1.0)],
            valueLabels=[],
            hidden=False,
            customData={},
        ),
        FontAxis(
            name="HORI",
            label="HORI",
            tag="HORI",
            minValue=0.0,
            defaultValue=0.0,
            maxValue=100.0,
            mapping=[(0.0, 0.0), (100.0, 1.0)],
            valueLabels=[],
            hidden=True,
            customData={},
        ),
        FontAxis(
            name="VERT",
            label="VERT",
            tag="VERT",
            minValue=0.0,
            defaultValue=0.0,
            maxValue=100.0,
            mapping=[(0.0, 0.0), (100.0, 1.0)],
            valueLabels=[],
            hidden=True,
            customData={},
        ),
    ],
    mappings=[],
    elidedFallBackname=None,
    customData={},
)


async def test_readAvar2(testFontAvar2):
    axes = await testFontAvar2.getAxes()
    assert expectedAxes == axes
