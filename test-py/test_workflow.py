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


@pytest.mark.parametrize(
    "configYAMLSources",
    [
        [
            """
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
            """
        ],
        [
            """
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
            """,
            """
            steps:

            - action: output
              destination: "testing.fontra"
            """,
        ],
    ],
)
def test_command(tmpdir, configYAMLSources):
    tmpdir = pathlib.Path(tmpdir)

    configs = [yaml.safe_load(source) for source in configYAMLSources]
    configPaths = []
    for index, config in enumerate(configs):
        for step in config["steps"]:
            if "source" in step:
                step["source"] = str(pathlib.Path(step["source"]).resolve())
        configPath = pathlib.Path(tmpdir) / f"config_{index}.yaml"
        configPath.write_text(yaml.dump(config))
        configPaths.append(configPath)

    expectedFileNames = [p.name for p in configPaths]

    subprocess.run(
        ["fontra-workflow", *configPaths, "--output-dir", tmpdir], check=True
    )
    items = sorted([p.name for p in tmpdir.iterdir()])
    assert [*expectedFileNames, "testing.fontra"] == items


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
            [
                (
                    logging.WARNING,
                    "Merger: Glyph 'B' exists in both fonts",
                )
            ],
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
                    "Merger: Axis default values should be the same; weight, A: 400, B: 100",
                )
            ],
        ),
        (
            "susbset+scale",
            """
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
              destination: "output3.fontra"
            """,
            [],
        ),
        (
            "rename-axes",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: subset
              glyphNames: ["A"]
            - action: rename-axes
              axes:
                weight:
                  name: Thickness
                  tag: THCK
                  label: Thickness

            - action: output
              destination: "output-rename-axes.fontra"
            """,
            [],
        ),
        (
            "drop-unused-sources-and-layers",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-drop-unused-sources-and-layers.fontra"
            - action: subset
              glyphNames: ["S"]
            - action: drop-unused-sources-and-layers

            - action: output
              destination: "output-drop-unused-sources-and-layers.fontra"
            """,
            [],
        ),
        (
            "drop-axis-mappings",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: subset
              glyphNames: ["A"]
            - action: drop-axis-mapping

            - action: output
              destination: "output-drop-axis-mapping.fontra"
            """,
            [],
        ),
        (
            "drop-axis-mappings-with-explicit-axis",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: subset
              glyphNames: ["A"]
            - action: drop-axis-mapping
              axes: ["weight"]

            - action: output
              destination: "output-drop-axis-mapping.fontra"
            """,
            [],
        ),
        (
            "drop-axis-mappings-with-explicit-axis",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: subset
              glyphNames: ["A"]
            - action: drop-axis-mapping
              axes: ["non-existent"]

            - action: output
              destination: "output-drop-axis-mapping-noop.fontra"
            """,
            [],
        ),
        (
            "adjust-axes",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: subset
              glyphNames: ["A"]
            - action: adjust-axes
              axes:
                weight:
                  minValue: 200
                  defaultValue: 400
                  maxValue: 800

            - action: output
              destination: "output-adjust-axes.fontra"
            """,
            [],
        ),
        (
            "adjust-axes-no-mapping",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: subset
              glyphNames: ["A"]
            - action: subset
              glyphNames: ["A"]
            - action: drop-axis-mapping
            - action: adjust-axes
              axes:
                weight:
                  minValue: 200
                  defaultValue: 400
                  maxValue: 800

            - action: output
              destination: "output-adjust-axes-no-mapping.fontra"
            """,
            [],
        ),
        (
            "adjust-axes-no-source-remap",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: subset
              glyphNames: ["A"]
            - action: subset
              glyphNames: ["A"]
            - action: adjust-axes
              remapSources: false
              axes:
                weight:
                  minValue: 200
                  defaultValue: 400
                  maxValue: 800

            - action: output
              destination: "output-adjust-axes-no-source-remap.fontra"
            """,
            [],
        ),
        (
            "adjust-axes-no-mapping-no-source-remap",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: subset
              glyphNames: ["A"]
            - action: subset
              glyphNames: ["A"]
            - action: drop-axis-mapping
            - action: adjust-axes
              remapSources: false
              axes:
                weight:
                  minValue: 200
                  defaultValue: 400
                  maxValue: 800

            - action: output
              destination: "output-adjust-axes-no-mapping-no-source-remap.fontra"
            """,
            [],
        ),
        (
            "decompose-components",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-components.fontra"
            - action: decompose-components
            - action: output
              destination: "output-decompose-components.fontra"
            """,
            [],
        ),
        (
            "decompose-variable-components",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-varco.fontra"
            - action: decompose-components
              onlyVariableComponents: true
            - action: output
              destination: "output-decompose-variable-components.fontra"
            """,
            [],
        ),
    ],
)
async def test_workflow_actions(testName, configSource, expectedLog, tmpdir, caplog):
    caplog.set_level(logging.WARNING)
    tmpdir = pathlib.Path(tmpdir)
    config = yaml.safe_load(configSource)

    workflow = Workflow(config=config, parentDir=pathlib.Path())

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
                assert expectedLines == resultLines, resultPath
            else:
                assert False, resultPath

    record_tuples = [(rec.levelno, rec.message) for rec in caplog.records]
    assert expectedLog == record_tuples
