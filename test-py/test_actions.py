import pathlib

import pytest

from fontra.actions.actions import getAction
from fontra.backends import getFileSystemBackend

dataDir = pathlib.Path(__file__).resolve().parent / "data"
commonFontsDir = pathlib.Path(__file__).parent.parent / "test-common" / "fonts"


@pytest.fixture
def testFontraFont():
    return getFileSystemBackend(commonFontsDir / "MutatorSans.fontra")


async def test_scaleAction(testFontraFont):
    unscaledGlyph = await testFontraFont.getGlyph("period")
    arguments = {"scaleFactor": 2}
    action = getAction("scale", testFontraFont, arguments)
    scaledGlyph = await action.getGlyph("period")

    layerName = [*unscaledGlyph.layers.keys()][0]
    assert unscaledGlyph.layers[layerName].glyph.path.getControlBounds() == (
        60,
        0,
        110,
        120,
    )
    assert scaledGlyph.layers[layerName].glyph.path.getControlBounds() == (
        120,
        0,
        220,
        240,
    )
