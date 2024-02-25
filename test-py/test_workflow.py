import logging
import pathlib
import subprocess

import pytest
import yaml
from fontTools.misc.arrayTools import scaleRect
from testSupport import directoryTreeToList

from fontra.backends import getFileSystemBackend
from fontra.core.path import PackedPath
from fontra.core.protocols import ReadableFontBackend
from fontra.workflow.actions import ConnectableActionProtocol, getActionClass
from fontra.workflow.workflow import Workflow

dataDir = pathlib.Path(__file__).resolve().parent / "data"
workflowDataDir = dataDir / "workflow"
commonFontsDir = pathlib.Path(__file__).parent.parent / "test-common" / "fonts"


@pytest.fixture
def testFontraFont():
    return getFileSystemBackend(commonFontsDir / "MutatorSans.fontra")


@pytest.mark.parametrize("glyphName", ["A", "Q", "Adieresis", "period"])
async def test_scaleAction(testFontraFont, glyphName) -> None:
    scaleFactor = 2

    unscaledGlyph = await testFontraFont.getGlyph(glyphName)
    actionClass = getActionClass("scale")
    action = actionClass(scaleFactor=scaleFactor)
    assert isinstance(action, ConnectableActionProtocol)
    assert isinstance(action, ReadableFontBackend)

    async with action.connect(testFontraFont) as action:
        scaledGlyph = await action.getGlyph(glyphName)
        assert scaledGlyph is not None

        assert (
            await testFontraFont.getUnitsPerEm() * scaleFactor
            == await action.getUnitsPerEm()
        )

        for unscaledLayer, scaledLayer in zip(
            unscaledGlyph.layers.values(), scaledGlyph.layers.values()
        ):
            unscaledLayerGlyph = unscaledLayer.glyph
            scaledLayerGlyph = scaledLayer.glyph
            assert (
                unscaledLayerGlyph.xAdvance * scaleFactor == scaledLayerGlyph.xAdvance
            )

            unscaledBounds = unscaledLayerGlyph.path.getControlBounds()
            assert isinstance(scaledLayerGlyph.path, PackedPath)
            scaledBounds = scaledLayerGlyph.path.getControlBounds()
            if unscaledBounds is None:
                assert scaledBounds is None
            else:
                assert (
                    scaleRect(unscaledBounds, scaleFactor, scaleFactor) == scaledBounds
                )

            for unscaledComponent, scaledComponent in zip(
                unscaledLayerGlyph.components, scaledLayerGlyph.components
            ):
                assert (
                    unscaledComponent.transformation.translateX * scaleFactor
                    == scaledComponent.transformation.translateX
                )


async def test_subsetAction(testFontraFont, tmp_path) -> None:
    glyphNames = {"A"}

    glyphNamesFile = pathlib.Path(tmp_path) / "subset-glyphs.txt"
    glyphNamesFile.write_text("B\nC Adieresis\n")

    actionClass = getActionClass("subset")
    action = actionClass(glyphNames=glyphNames, glyphNamesFile=glyphNamesFile)
    assert isinstance(action, ConnectableActionProtocol)
    assert isinstance(action, ReadableFontBackend)

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

    async with action.connect(testFontraFont) as action:
        glyphMap = await action.getGlyphMap()

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


async def test_workflow(tmpdir):
    config = yaml.safe_load(testConfigYAML)
    workflow = Workflow(config=config)
    async with workflow.endPoints() as endPoints:
        assert endPoints.endPoint is not None

        for output in endPoints.outputs:
            await output.process(tmpdir)


def test_command(tmpdir):
    tmpdir = pathlib.Path(tmpdir)
    config = yaml.safe_load(testConfigYAML)
    for step in config["steps"]:
        if "source" in step:
            step["source"] = str(pathlib.Path(step["source"]).resolve())
    configPath = pathlib.Path(tmpdir) / "config.yaml"
    configPath.write_text(yaml.dump(config))
    subprocess.run(["fontra-workflow", configPath, "--output-dir", tmpdir], check=True)
    items = sorted([p.name for p in tmpdir.iterdir()])
    assert ["config.yaml", "testing.fontra"] == items


@pytest.mark.parametrize(
    "testName, configSource, expectedLog",
    [
        (
            "plain",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: input
              source: "test-py/data/workflow/input1-B.fontra"
            - action: output
              destination: "output1.fontra"
            """,
            [],
        ),
        (
            "axis-merge-1",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input2-A.fontra"
            - action: input
              source: "test-py/data/workflow/input2-B.fontra"
            - action: output
              destination: "output2.fontra"
            """,
            [
                (
                    logging.ERROR,
                    "Axis default values are not compatible; weight: 400.0, weight: 100.0",
                )
            ],
        ),
    ],
)
async def test_workflowMultiple(testName, configSource, expectedLog, tmpdir, caplog):
    caplog.set_level(logging.WARNING)
    tmpdir = pathlib.Path(tmpdir)
    config = yaml.safe_load(configSource)

    workflow = Workflow(config=config)

    async with workflow.endPoints() as endPoints:
        assert endPoints.endPoint is not None

        for output in endPoints.outputs:
            await output.process(tmpdir)
            expectedPath = workflowDataDir / output.destination
            resultPath = tmpdir / output.destination
            if expectedPath.is_file():
                raise NotImplementedError("file comparison to be implemented")
            elif expectedPath.is_dir():
                expectedLines = directoryTreeToList(expectedPath)
                resultLines = directoryTreeToList(resultPath)
                assert expectedLines == resultLines
            else:
                assert False, resultPath

    record_tuples = [(rec.levelno, rec.message) for rec in caplog.records]
    assert expectedLog == record_tuples
