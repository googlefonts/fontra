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
from fontra.workflow.actions import FilterActionProtocol, getActionClass
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
    actionClass = getActionClass("filter", "scale")
    action = actionClass(scaleFactor=scaleFactor)
    assert isinstance(action, FilterActionProtocol)
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

            for unscaledGuideline, scaledGuideline in zip(
                unscaledLayerGlyph.guidelines, scaledLayerGlyph.guidelines
            ):
                assert unscaledGuideline.x * scaleFactor == scaledGuideline.x
                assert unscaledGuideline.y * scaleFactor == scaledGuideline.y
                assert unscaledGuideline.name == scaledGuideline.name
                assert unscaledGuideline.angle == scaledGuideline.angle


async def test_subsetAction(testFontraFont, tmp_path) -> None:
    glyphNames = {"A"}

    glyphNamesFile = pathlib.Path(tmp_path) / "subset-glyphs.txt"
    glyphNamesFile.write_text("B\nC Adieresis\n")

    actionClass = getActionClass("filter", "subset-glyphs")
    action = actionClass(glyphNames=glyphNames, glyphNamesFile=glyphNamesFile)
    assert isinstance(action, FilterActionProtocol)
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

            - input: fontra-read
              source: "test-py/data/mutatorsans/MutatorSans.designspace"
              steps:
              - filter: scale
                scaleFactor: 0.75
                scaleUnitsPerEm: false
              - filter: subset-glyphs
                glyphNames: ["A", "B", "Adieresis"]

            - input: fontra-read
              source: "test-common/fonts/MutatorSans.fontra"
              steps:
              - filter: subset-glyphs
                glyphNames: ["C", "D"]

            - output: fontra-write
              destination: "testing.fontra"
            """
        ],
        [
            """
            steps:

            - input: fontra-read
              source: "test-py/data/mutatorsans/MutatorSans.designspace"
              steps:
              - filter: scale
                scaleFactor: 0.75
                scaleUnitsPerEm: false
              - filter: subset-glyphs
                glyphNames: ["A", "B", "Adieresis"]

            - input: fontra-read
              source: "test-common/fonts/MutatorSans.fontra"
              steps:
              - filter: subset-glyphs
                glyphNames: ["C", "D"]
            """,
            """
            steps:

            - output: fontra-write
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
    "testName, configSource, continueOnError, expectedLog",
    [
        (
            "plain",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - input: fontra-read
              source: "test-py/data/workflow/input1-B.fontra"
            - output: fontra-write
              destination: "output1.fontra"
            """,
            False,
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
            - input: fontra-read
              source: "test-py/data/workflow/input2-A.fontra"
            - input: fontra-read
              source: "test-py/data/workflow/input2-B.fontra"
            - output: fontra-write
              destination: "output2.fontra"
            """,
            False,
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

            - input: fontra-read
              source: "test-common/fonts/MutatorSans.fontra"
              steps:
              - filter: scale
                scaleFactor: 0.75
                scaleUnitsPerEm: false
              - filter: subset-glyphs
                glyphNames: ["B", "Adieresis"]
                glyphNamesFile: test-py/data/workflow/subset-keep-glyph-names.txt

            - input: fontra-read
              source: "test-common/fonts/MutatorSans.fontra"
              steps:
              - filter: subset-glyphs
                glyphNames: ["C", "D"]

            - output: fontra-write
              destination: "output3.fontra"
            """,
            False,
            [],
        ),
        (
            "rename-axes",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: subset-glyphs
              glyphNames: ["A"]
            - filter: rename-axes
              axes:
                weight:
                  name: Thickness
                  tag: THCK
                  label: Thickness

            - output: fontra-write
              destination: "output-rename-axes.fontra"
            """,
            False,
            [],
        ),
        (
            "drop-unused-sources-and-layers",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-drop-unused-sources-and-layers.fontra"
            - filter: subset-glyphs
              glyphNames: ["S"]
            - filter: drop-unused-sources-and-layers

            - output: fontra-write
              destination: "output-drop-unused-sources-and-layers.fontra"
            """,
            False,
            [],
        ),
        (
            "drop-axis-mappings",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: subset-glyphs
              glyphNames: ["A"]
            - filter: drop-axis-mappings

            - output: fontra-write
              destination: "output-drop-axis-mapping.fontra"
            """,
            False,
            [],
        ),
        (
            "drop-axis-mappings-with-explicit-axis",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: subset-glyphs
              glyphNames: ["A"]
            - filter: drop-axis-mappings
              axes: ["weight"]

            - output: fontra-write
              destination: "output-drop-axis-mapping.fontra"
            """,
            False,
            [],
        ),
        (
            "drop-axis-mappings-with-explicit-axis",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: subset-glyphs
              glyphNames: ["A"]
            - filter: drop-axis-mappings
              axes: ["non-existent"]

            - output: fontra-write
              destination: "output-drop-axis-mapping-noop.fontra"
            """,
            False,
            [],
        ),
        (
            "adjust-axes",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: subset-glyphs
              glyphNames: ["A"]
            - filter: adjust-axes
              axes:
                weight:
                  minValue: 200
                  defaultValue: 400
                  maxValue: 800

            - output: fontra-write
              destination: "output-adjust-axes.fontra"
            """,
            False,
            [],
        ),
        (
            "adjust-axes-no-mapping",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: subset-glyphs
              glyphNames: ["A"]
            - filter: subset-glyphs
              glyphNames: ["A"]
            - filter: drop-axis-mappings
            - filter: adjust-axes
              axes:
                weight:
                  minValue: 200
                  defaultValue: 400
                  maxValue: 800

            - output: fontra-write
              destination: "output-adjust-axes-no-mapping.fontra"
            """,
            False,
            [],
        ),
        (
            "adjust-axes-no-source-remap",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: subset-glyphs
              glyphNames: ["A"]
            - filter: subset-glyphs
              glyphNames: ["A"]
            - filter: adjust-axes
              remapSources: false
              axes:
                weight:
                  minValue: 200
                  defaultValue: 400
                  maxValue: 800

            - output: fontra-write
              destination: "output-adjust-axes-no-source-remap.fontra"
            """,
            False,
            [],
        ),
        (
            "adjust-axes-no-mapping-no-source-remap",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: subset-glyphs
              glyphNames: ["A"]
            - filter: subset-glyphs
              glyphNames: ["A"]
            - filter: drop-axis-mappings
            - filter: adjust-axes
              remapSources: false
              axes:
                weight:
                  minValue: 200
                  defaultValue: 400
                  maxValue: 800

            - output: fontra-write
              destination: "output-adjust-axes-no-mapping-no-source-remap.fontra"
            """,
            False,
            [],
        ),
        (
            "adjust-axes-set-axis-values",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: subset-glyphs
              glyphNames: []
            - filter: adjust-axes
              axes:
                weight:
                  valueLabels: [
                    {"name": "Regular", "value": 400, "elidable": true},
                    {"name": "Bold", "value": 700},
                  ]
                  hidden: true

            - output: fontra-write
              destination: "output-adjust-axes-set-axis-values.fontra"
            """,
            False,
            [],
        ),
        (
            "decompose-composites",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-composites.fontra"
            - filter: decompose-composites
            - output: fontra-write
              destination: "output-decompose-composites.fontra"
            """,
            False,
            [],
        ),
        (
            "decompose-only-variable-composites",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-composites.fontra"
            - filter: decompose-composites
              onlyVariableComposites: true
            - output: fontra-write
              destination: "output-decompose-only-variable-composites.fontra"
            """,
            False,
            [],
        ),
        (
            "decompose-variable-composites",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-variable-composites.fontra"
            - filter: decompose-composites
              onlyVariableComposites: true
            - output: fontra-write
              destination: "output-decompose-variable-composites.fontra"
            """,
            False,
            [],
        ),
        (
            "decompose-variable-composites-deep-axes",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-variable-composites-deep-axes.fontra"
            - filter: decompose-composites
              onlyVariableComposites: true
            - output: fontra-write
              destination: "output-decompose-variable-composites-deep-axes.fontra"
            """,
            False,
            [],
        ),
        (
            "set-font-info",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-set-font-info.fontra"
            - filter: set-font-info
              fontInfo:
                familyName: "A Brand New Font"
                unknownName: "Unknown, will be warned about"
                designer: "Joe Font Designer"
            - output: fontra-write
              destination: "output-set-font-info.fontra"
            """,
            False,
            [(logging.ERROR, "set-font-info: unknown name(s): 'unknownName'")],
        ),
        (
            "drop-unreachable-glyphs-composed",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-drop-unreachable-glyphs.fontra"
            - filter: drop-unreachable-glyphs
            - output: fontra-write
              destination: "output-drop-unreachable-glyphs-composed.fontra"
            """,
            False,
            [],
        ),
        (
            "drop-unreachable-glyphs-decomposed",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-drop-unreachable-glyphs.fontra"
            - filter: decompose-composites
            - filter: drop-unreachable-glyphs
            - output: fontra-write
              destination: "output-drop-unreachable-glyphs-decomposed.fontra"
            """,
            False,
            [],
        ),
        (
            "subset-keep-glyphs",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: subset-glyphs
              glyphNamesFile: test-py/data/workflow/subset-keep-glyph-names.txt

            - output: fontra-write
              destination: "output-subset-keep-drop-glyphs.fontra"
            """,
            False,
            [],
        ),
        (
            "subset-drop-glyphs",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: subset-glyphs
              dropGlyphNames: ["B"]

            - output: fontra-write
              destination: "output-subset-keep-drop-glyphs.fontra"
            """,
            False,
            [],
        ),
        (
            "subset-drop-glyphs",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: subset-glyphs
              dropGlyphNamesFile: test-py/data/workflow/subset-drop-glyph-names.txt

            - output: fontra-write
              destination: "output-subset-keep-drop-glyphs.fontra"
            """,
            False,
            [],
        ),
        (
            "subset-keep-axis",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: subset-axes
              axisNames: ["weight"]

            - output: fontra-write
              destination: "output-subset-axes.fontra"
            """,
            False,
            [],
        ),
        (
            "subset-drop-axis",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: subset-axes
              dropAxisNames: ["width", "italic"]

            - output: fontra-write
              destination: "output-subset-axes.fontra"
            """,
            False,
            [],
        ),
        (
            "subset-move-default-location",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-move-default-location.fontra"
            - filter: subset-axes
              dropAxisNames: ["italic"]
            - filter: move-default-location
              newDefaultUserLocation:
                width: 400
                weight: 300

            - output: fontra-write
              destination: "output-move-default-location.fontra"
            """,
            False,
            [],
        ),
        (
            "trim-axes",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-trim-axes.fontra"
            - filter: trim-axes
              axes:
                width:
                  minValue: 100
                  maxValue: 700
                weight:
                  minValue: 200
                  maxValue: 800

            - output: fontra-write
              destination: "output-trim-axes.fontra"
            """,
            False,
            [],
        ),
        (
            "error-glyph",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-error-glyph.fontra"

            - output: fontra-write
              destination: "output-error-glyph.fontra"
            """,
            True,
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
            - input: fontra-read
              source: "test-py/data/workflow/input-check-interpolation.fontra"

            - filter: check-interpolation

            - output: fontra-write
              destination: "output-check-interpolation.fontra"
            """,
            True,
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
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"

            - input: fontra-read
              source: "test-py/data/workflow/input-merge-codepoint-conflict.fontra"

            - output: fontra-write
              destination: "output-merge-codepoint-conflict.fontra"
            """,
            False,
            [],
        ),
        (
            "cache-tests",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: memory-cache
            - filter: disk-cache
            - output: fontra-write
              destination: "input1-A.fontra"
            """,
            False,
            [],
        ),
        (
            "subset-by-development-status-default-yes",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-variable-composites.fontra"
            - filter: drop-shapes
            - filter: subset-by-development-status
              statuses: [4]
            - filter: drop-unreachable-glyphs
            - output: fontra-write
              destination: "output-subset-by-development-status-yes.fontra"
            """,
            False,
            [],
        ),
        (
            "subset-by-development-status-default-no",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-variable-composites.fontra"
            - filter: drop-shapes
            - filter: subset-by-development-status
              statuses: [3]
            - filter: drop-unreachable-glyphs
            - output: fontra-write
              destination: "output-subset-by-development-status-no.fontra"
            """,
            False,
            [],
        ),
        (
            "subset-by-development-status-all-no",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-variable-composites.fontra"
            - filter: drop-shapes
            - filter: subset-by-development-status
              statuses: [4]
              sourceSelectBehavior: all
            - filter: drop-unreachable-glyphs
            - output: fontra-write
              destination: "output-subset-by-development-status-no.fontra"
            """,
            False,
            [],
        ),
        (
            "subset-by-development-status-any-yes",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-variable-composites.fontra"
            - filter: drop-shapes
            - filter: subset-by-development-status
              statuses: [3]
              sourceSelectBehavior: any
            - filter: drop-unreachable-glyphs
            - output: fontra-write
              destination: "output-subset-by-development-status-yes.fontra"
            """,
            False,
            [],
        ),
        (
            "subset-by-development-status-any-no",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-variable-composites.fontra"
            - filter: drop-shapes
            - filter: subset-by-development-status
              statuses: [2]
              sourceSelectBehavior: any
            - filter: drop-unreachable-glyphs
            - output: fontra-write
              destination: "output-subset-by-development-status-no.fontra"
            """,
            False,
            [],
        ),
        (
            "amend-cmap",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: subset-axes
              axisNames: ["weight"]
            - filter: drop-shapes
            - filter: amend-cmap
              cmap:
                U+0041: A
                0x42:
                U+0061:
                0x62:
                0x1234: B
            - output: fontra-write
              destination: "output-amend-cmap.fontra"
            """,
            False,
            [],
        ),
        (
            "amend-cmap-from-file",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input1-A.fontra"
            - filter: subset-axes
              axisNames: ["weight"]
            - filter: drop-shapes
            - filter: amend-cmap
              cmapFile: "test-py/data/workflow/amend-cmap-cmap.txt"
            - output: fontra-write
              destination: "output-amend-cmap.fontra"
            """,
            False,
            [],
        ),
        (
            "merge-features",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-merge-features-A.fontra"
            - input: fontra-read
              source: "test-py/data/workflow/input-merge-features-B.fontra"
            - output: fontra-write
              destination: "output-merge-features.fontra"
            """,
            False,
            [],
        ),
        (
            "subset-features",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/output-merge-features.fontra"
            - filter: subset-glyphs
              glyphNames: ["A", "A.alt"]
            - output: fontra-write
              destination: "output-subset-features.fontra"
            """,
            False,
            [],
        ),
        (
            "subset-features-closure",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/output-merge-features.fontra"
            - filter: subset-glyphs
              layoutHandling: "closure"
              glyphNames: ["A"]
            - output: fontra-write
              destination: "output-subset-features.fontra"
            """,
            False,
            [],
        ),
        (
            "round-coordinates",
            """
            steps:
            - input: fontra-read
              source: "test-common/fonts/MutatorSans.fontra"
            - filter: subset-glyphs
              glyphNames: ["E", "Aacute"]
            - filter: subset-axes
              axisNames: ["weight"]
            - filter: move-default-location
              newDefaultUserLocation:
                weight: 431
            - filter: trim-axes
              axes:
                weight:
                  minValue: 223
                  maxValue: 734
            - filter: round-coordinates
            - output: fontra-write
              destination: "output-round-coordinates.fontra"
            """,
            False,
            [],
        ),
        (
            "generate-palt-feature",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-generate-palt-feature.fontra"
            - filter: generate-palt-feature
            - output: fontra-write
              destination: "output-generate-palt-feature.fontra"
            """,
            False,
            [],
        ),
        (
            "generate-palt-feature-single-source",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-generate-palt-feature.fontra"
            - filter: subset-axes
              axisNames: []
            - filter: generate-palt-feature
              languageSystems:
              - ["kana", "dflt"]
            - output: fontra-write
              destination: "output-generate-palt-feature-single-source.fontra"
            """,
            False,
            [],
        ),
        (
            "axis-value-inheritance",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-axis-value-inheritance.fontra"
            - filter: decompose-composites
            - output: fontra-write
              destination: "output-axis-value-inheritance.fontra"
            """,
            False,
            [],
        ),
        (
            "instantiate-full",
            """
            steps:
            - input: fontra-read
              source: "test-common/fonts/MutatorSans.fontra"
            - filter: subset-glyphs
              glyphNames: ["A", "B"]
            - filter: subset-axes
              axisNames: ["weight", "width"]  # prevent crash on discrete italic
            - filter: instantiate
              location:
                weight: 300
                width: 400
            - filter: round-coordinates
            - output: fontra-write
              destination: "output-instantiate-full.fontra"
            """,
            False,
            [],
        ),
        (
            "instantiate-partial",
            """
            steps:
            - input: fontra-read
              source: "test-common/fonts/MutatorSans.fontra"
            - filter: subset-glyphs
              glyphNames: ["A", "B"]
            - filter: subset-axes
              axisNames: ["weight", "width"]  # prevent crash on discrete italic
            - filter: instantiate
              location:
                width: 400
            - filter: round-coordinates
            - output: fontra-write
              destination: "output-instantiate-partial.fontra"
            """,
            False,
            [],
        ),
        (
            "add-features",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-merge-features-A.fontra"
            - filter: add-features
              featureFile: test-py/data/workflow/add-features.fea
            - output: fontra-write
              destination: "output-add-features.fontra"
            """,
            False,
            [],
        ),
        (
            "interpolation-fail",
            """
            steps:
            - input: fontra-read
              source: "test-py/data/workflow/input-interpolation-fail.fontra"
            - filter: trim-axes
              axes:
                weight:
                  maxValue: 600
            - output: fontra-write
              destination: "output-interpolation-fail.fontra"
            """,
            False,
            [
                (
                    40,
                    "glyph A caused an error: InterpolationError('paths are not compatible')",
                ),
            ],
        ),
    ],
)
async def test_workflow_actions(
    testName, configSource, continueOnError, expectedLog, tmpdir, caplog
):
    caplog.set_level(logging.WARNING)
    tmpdir = pathlib.Path(tmpdir)
    config = yaml.safe_load(configSource)

    workflow = Workflow(config=config, parentDir=pathlib.Path())

    async with workflow.endPoints() as endPoints:
        assert endPoints.endPoint is not None

        for output in endPoints.outputs:
            await output.process(tmpdir, continueOnError=continueOnError)
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
