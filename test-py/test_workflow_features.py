from fontra.workflow.features import mergeFeatures

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


def makeGlyphMap(glyphNames):
    return {glyphName: [] for glyphName in glyphNames}
