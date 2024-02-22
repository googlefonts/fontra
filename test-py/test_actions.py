import pathlib

import pytest
import yaml
from fontTools.misc.arrayTools import scaleRect

from fontra.actions.actions import getAction
from fontra.actions.pipeline import Pipeline
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
    action = getAction("scale", testFontraFont, scaleFactor=scaleFactor)
    scaledGlyph = await action.getGlyph(glyphName)

    assert (
        await testFontraFont.getUnitsPerEm() * scaleFactor
        == await action.getUnitsPerEm()
    )

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


async def test_subsetAction(testFontraFont, tmp_path):
    glyphNames = {"A"}

    glyphNamesFile = pathlib.Path(tmp_path) / "subset-glyphs.txt"
    glyphNamesFile.write_text("B\nC Adieresis\n")

    action = getAction(
        "subset", testFontraFont, glyphNames=glyphNames, glyphNamesFile=glyphNamesFile
    )

    glyphMap = await action.getGlyphMap()

    expectedGlyphMap = {
        "A": [
            65,
            97,
        ],
        "Adieresis": [
            196,
            228,
        ],
        "B": [
            66,
            98,
        ],
        "C": [
            67,
            99,
        ],
        "dieresis": [
            168,
        ],
        "dot": [
            10193,
        ],
    }

    assert expectedGlyphMap == glyphMap


testConfigYAML = """
steps:

- action: input
  source: "test-py/data/mutatorsans/MutatorSans.designspace"
  steps:
  - action: scale
    scaleFactor: 0.75
    scaleUnitsPerEm: false
  - action: subset
    glyphNames: ["A", "B", "Adieresis"]

- action: input
  source: "test-common/fonts/MutatorSans.fontra"
  steps:
  - action: subset
    glyphNames: ["C", "D"]

- action: output
  destination: "testing.fontra"
  # steps:
"""


async def test_pipeline():
    config = yaml.safe_load(testConfigYAML)
    pipeline = Pipeline(config=config)
    print(pipeline)
