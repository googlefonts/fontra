from fontra.workflow.features import LayoutHandling, mergeFeatures, subsetFeatures

mergeFeatureTextA = """\
languagesystem DFLT dflt;

@group_A = [A A.alt];

# comment 1

feature calt {
    sub A by A.alt;
    sub @group_A by A.alt;
} calt;
"""

mergeFeatureTextB = """\
languagesystem latn dflt;

@group_B = [B B.alt C];

# comment 2

feature calt {
    sub B by B.alt;
    sub @group_B by C;
} calt;
"""

expectedMergeFeatureText = """\
languagesystem DFLT dflt;
languagesystem latn dflt;
@group_A = [A A.alt];
# comment 1
feature calt {
    sub A by A.alt;
    sub @group_A by A.alt;
} calt;

# comment 2
feature calt {
    sub B by B.alt;
    sub [B B.alt C] by [C C C];
} calt;
"""


def test_mergeFeatures():
    glyphMapA = makeGlyphMap(["A", "A.alt"])
    glyphMapB = makeGlyphMap(["B", "B.alt", "C"])

    mergedFeatureText, glyphMap = mergeFeatures(
        mergeFeatureTextA, glyphMapA, mergeFeatureTextB, glyphMapB
    )
    assert ["A", "A.alt", "B", "B.alt", "C"] == sorted(glyphMap)
    assert expectedMergeFeatureText == mergedFeatureText


expectedSubsettedFeatureText = """\
languagesystem DFLT dflt;
languagesystem latn dflt;
# comment 1
feature calt {
    sub A by A.alt;
    sub [A A.alt] by [A.alt A.alt];
} calt;

# comment 2\
"""


def test_subsetFeatures():
    glyphMap = makeGlyphMap(["A", "A.alt", "B", "B.alt", "C"])
    subsettedFeatureText, subsettedGlyphMap = subsetFeatures(
        expectedMergeFeatureText,
        glyphMap,
        keepGlyphNames=["A", "A.alt"],
        layoutHandling=LayoutHandling.SUBSET,
    )
    assert ["A", "A.alt"] == sorted(subsettedGlyphMap)
    assert expectedSubsettedFeatureText == subsettedFeatureText

    subsettedFeatureText, subsettedGlyphMap = subsetFeatures(
        expectedMergeFeatureText,
        glyphMap,
        keepGlyphNames=["A"],
        layoutHandling=LayoutHandling.CLOSURE,
    )
    assert ["A", "A.alt"] == sorted(subsettedGlyphMap)
    assert expectedSubsettedFeatureText == subsettedFeatureText


def makeGlyphMap(glyphNames):
    return {glyphName: [] for glyphName in glyphNames}
