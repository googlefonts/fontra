import pathlib

import pytest
from fontTools.misc.arrayTools import scaleRect

from fontra.actions.actions import getAction
from fontra.backends import getFileSystemBackend

dataDir = pathlib.Path(__file__).resolve().parent / "data"
commonFontsDir = pathlib.Path(__file__).parent.parent / "test-common" / "fonts"


@pytest.fixture
def testFontraFont():
    return getFileSystemBackend(commonFontsDir / "MutatorSans.fontra")


@pytest.mark.parametrize("glyphName", ["A", "Q", "Adieresis", "period"])
async def test_scaleAction(testFontraFont, glyphName):
    scaleFactor = 2

    unscaledGlyph = await testFontraFont.getGlyph(glyphName)
    arguments = {"scaleFactor": scaleFactor}
    action = getAction("scale", testFontraFont, arguments)
    scaledGlyph = await action.getGlyph(glyphName)

    for unscaledLayer, scaledLayer in zip(
        unscaledGlyph.layers.values(), scaledGlyph.layers.values()
    ):
        unscaledLayerGlyph = unscaledLayer.glyph
        scaledLayerGlyph = scaledLayer.glyph

        unscaledBounds = unscaledLayerGlyph.path.getControlBounds()
        scaledBounds = scaledLayerGlyph.path.getControlBounds()
        if unscaledBounds is None:
            assert scaledBounds is None
        else:
            assert scaleRect(unscaledBounds, scaleFactor, scaleFactor) == scaledBounds

        for unscaledComponent, scaledComponent in zip(
            unscaledLayerGlyph.components, scaledLayerGlyph.components
        ):
            assert (
                unscaledComponent.transformation.translateX * scaleFactor
                == scaledComponent.transformation.translateX
            )
