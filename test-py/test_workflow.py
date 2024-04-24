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


@pytest.mark.parametrize("glyphName", ["A", "E", "Q", "Adieresis", "period"])
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

            for unscaledAnchor, scaledAnchor in zip(
                unscaledLayerGlyph.anchors, scaledLayerGlyph.anchors
            ):
                assert unscaledAnchor.x * scaleFactor == scaledAnchor.x
                assert unscaledAnchor.y * scaleFactor == scaledAnchor.y
                assert unscaledAnchor.name == scaledAnchor.name


async def test_subsetAction(testFontraFont, tmp_path) -> None:
    glyphNames = {"A"}

    glyphNamesFile = pathlib.Path(tmp_path) / "subset-glyphs.txt"
    glyphNamesFile.write_text("B\nC Adieresis\n")

    actionClass = getActionClass("subset-glyphs")
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
              - action: subset-glyphs
                glyphNames: ["A", "B", "Adieresis"]

            - action: input
              source: "test-common/fonts/MutatorSans.fontra"
              steps:
              - action: subset-glyphs
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
              - action: subset-glyphs
                glyphNames: ["A", "B", "Adieresis"]

            - action: input
              source: "test-common/fonts/MutatorSans.fontra"
              steps:
              - action: subset-glyphs
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
        [
            "fontra-workflow",
            *configPaths,
            "--output-dir",
            tmpdir,
            "--continue-on-error",
        ],
        check=True,
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
            "subset+scale",
            """
            steps:

            - action: input
              source: "test-common/fonts/MutatorSans.fontra"
              steps:
              - action: scale
                scaleFactor: 0.75
                scaleUnitsPerEm: false
              - action: subset-glyphs
                glyphNames: ["B", "Adieresis"]
                glyphNamesFile: test-py/data/workflow/subset-keep-glyph-names.txt

            - action: input
              source: "test-common/fonts/MutatorSans.fontra"
              steps:
              - action: subset-glyphs
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
            - action: subset-glyphs
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
            - action: subset-glyphs
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
            - action: subset-glyphs
              glyphNames: ["A"]
            - action: drop-axis-mappings

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
            - action: subset-glyphs
              glyphNames: ["A"]
            - action: drop-axis-mappings
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
            - action: subset-glyphs
              glyphNames: ["A"]
            - action: drop-axis-mappings
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
            - action: subset-glyphs
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
            - action: subset-glyphs
              glyphNames: ["A"]
            - action: subset-glyphs
              glyphNames: ["A"]
            - action: drop-axis-mappings
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
            - action: subset-glyphs
              glyphNames: ["A"]
            - action: subset-glyphs
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
            - action: subset-glyphs
              glyphNames: ["A"]
            - action: subset-glyphs
              glyphNames: ["A"]
            - action: drop-axis-mappings
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
            "adjust-axes-set-axis-values",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: subset-glyphs
              glyphNames: []
            - action: adjust-axes
              axes:
                weight:
                  valueLabels: [
                    {"name": "Regular", "value": 400, "elidable": true},
                    {"name": "Bold", "value": 700},
                  ]
                  hidden: true

            - action: output
              destination: "output-adjust-axes-set-axis-values.fontra"
            """,
            [],
        ),
        (
            "decompose-composites",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-composites.fontra"
            - action: decompose-composites
            - action: output
              destination: "output-decompose-composites.fontra"
            """,
            [],
        ),
        (
            "decompose-only-variable-composites",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-composites.fontra"
            - action: decompose-composites
              onlyVariableComposites: true
            - action: output
              destination: "output-decompose-only-variable-composites.fontra"
            """,
            [],
        ),
        (
            "decompose-variable-composites",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-variable-composites.fontra"
            - action: decompose-composites
              onlyVariableComposites: true
            - action: output
              destination: "output-decompose-variable-composites.fontra"
            """,
            [],
        ),
        (
            "decompose-variable-composites-deep-axes",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-variable-composites-deep-axes.fontra"
            - action: decompose-composites
              onlyVariableComposites: true
            - action: output
              destination: "output-decompose-variable-composites-deep-axes.fontra"
            """,
            [],
        ),
        (
            "set-font-info",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-set-font-info.fontra"
            - action: set-font-info
              fontInfo:
                familyName: "A Brand New Font"
                unknownName: "Unknown, will be warned about"
                designer: "Joe Font Designer"
            - action: output
              destination: "output-set-font-info.fontra"
            """,
            [(logging.ERROR, "set-font-info: unknown name(s): 'unknownName'")],
        ),
        (
            "drop-unreachable-glyphs-composed",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-drop-unreachable-glyphs.fontra"
            - action: drop-unreachable-glyphs
            - action: output
              destination: "output-drop-unreachable-glyphs-composed.fontra"
            """,
            [],
        ),
        (
            "drop-unreachable-glyphs-decomposed",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-drop-unreachable-glyphs.fontra"
            - action: decompose-composites
            - action: drop-unreachable-glyphs
            - action: output
              destination: "output-drop-unreachable-glyphs-decomposed.fontra"
            """,
            [],
        ),
        (
            "subset-keep-glyphs",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: subset-glyphs
              glyphNamesFile: test-py/data/workflow/subset-keep-glyph-names.txt

            - action: output
              destination: "output-subset-keep-drop-glyphs.fontra"
            """,
            [],
        ),
        (
            "subset-drop-glyphs",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: subset-glyphs
              dropGlyphNames: ["B"]

            - action: output
              destination: "output-subset-keep-drop-glyphs.fontra"
            """,
            [],
        ),
        (
            "subset-drop-glyphs",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: subset-glyphs
              dropGlyphNamesFile: test-py/data/workflow/subset-drop-glyph-names.txt

            - action: output
              destination: "output-subset-keep-drop-glyphs.fontra"
            """,
            [],
        ),
        (
            "subset-keep-axis",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: subset-axes
              axisNames: ["weight"]

            - action: output
              destination: "output-subset-axes.fontra"
            """,
            [],
        ),
        (
            "subset-drop-axis",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: subset-axes
              dropAxisNames: ["width", "italic"]

            - action: output
              destination: "output-subset-axes.fontra"
            """,
            [],
        ),
        (
            "subset-move-default-location",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-move-default-location.fontra"
            - action: subset-axes
              dropAxisNames: ["italic"]
            - action: move-default-location
              newDefaultUserLocation:
                width: 400
                weight: 300

            - action: output
              destination: "output-move-default-location.fontra"
            """,
            [],
        ),
        (
            "trim-axes",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-trim-axes.fontra"
            - action: trim-axes
              axes:
                width:
                  minValue: 100
                  maxValue: 700
                weight:
                  minValue: 200
                  maxValue: 800

            - action: output
              destination: "output-trim-axes.fontra"
            """,
            [],
        ),
        (
            "error-glyph",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-error-glyph.fontra"

            - action: output
              destination: "output-error-glyph.fontra"
            """,
            [
                (
                    40,
                    "glyph A caused an error: JSONDecodeError('Expecting value: line "
                    "1 column 1 (char 0)')",
                )
            ],
        ),
        (
            "check-interpolation",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-check-interpolation.fontra"

            - action: check-interpolation

            - action: output
              destination: "output-check-interpolation.fontra"
            """,
            [
                (
                    40,
                    "glyph A caused an error: InterpolationError('paths are not "
                    "compatible')",
                )
            ],
        ),
        (
            "merge-codepoint-conflict",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"

            - action: input
              source: "test-py/data/workflow/input-merge-codepoint-conflict.fontra"

            - action: output
              destination: "output-merge-codepoint-conflict.fontra"
            """,
            [],
        ),
        (
            "cache-tests",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: memory-cache
            - action: disk-cache
            - action: output
              destination: "input1-A.fontra"
            """,
            [],
        ),
        (
            "subset-by-development-status-default-yes",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-variable-composites.fontra"
            - action: drop-shapes
            - action: subset-by-development-status
              statuses: [4]
            - action: drop-unreachable-glyphs
            - action: output
              destination: "output-subset-by-development-status-yes.fontra"
            """,
            [],
        ),
        (
            "subset-by-development-status-default-no",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-variable-composites.fontra"
            - action: drop-shapes
            - action: subset-by-development-status
              statuses: [3]
            - action: drop-unreachable-glyphs
            - action: output
              destination: "output-subset-by-development-status-no.fontra"
            """,
            [],
        ),
        (
            "subset-by-development-status-all-no",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-variable-composites.fontra"
            - action: drop-shapes
            - action: subset-by-development-status
              statuses: [4]
              sourceSelectBehavior: all
            - action: drop-unreachable-glyphs
            - action: output
              destination: "output-subset-by-development-status-no.fontra"
            """,
            [],
        ),
        (
            "subset-by-development-status-any-yes",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-variable-composites.fontra"
            - action: drop-shapes
            - action: subset-by-development-status
              statuses: [3]
              sourceSelectBehavior: any
            - action: drop-unreachable-glyphs
            - action: output
              destination: "output-subset-by-development-status-yes.fontra"
            """,
            [],
        ),
        (
            "subset-by-development-status-any-no",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input-variable-composites.fontra"
            - action: drop-shapes
            - action: subset-by-development-status
              statuses: [2]
              sourceSelectBehavior: any
            - action: drop-unreachable-glyphs
            - action: output
              destination: "output-subset-by-development-status-no.fontra"
            """,
            [],
        ),
        (
            "amend-cmap",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: subset-axes
              axisNames: ["weight"]
            - action: drop-shapes
            - action: amend-cmap
              cmap:
                U+0041: A
                0x42:
                U+0061:
                0x62:
                0x1234: B
            - action: output
              destination: "output-amend-cmap.fontra"
            """,
            [],
        ),
        (
            "amend-cmap-from-file",
            """
            steps:
            - action: input
              source: "test-py/data/workflow/input1-A.fontra"
            - action: subset-axes
              axisNames: ["weight"]
            - action: drop-shapes
            - action: amend-cmap
              cmapFile: "test-py/data/workflow/amend-cmap-cmap.txt"
            - action: output
              destination: "output-amend-cmap.fontra"
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
            await output.process(tmpdir, continueOnError=True)
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
