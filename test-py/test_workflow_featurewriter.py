from fontra.workflow.featurewriter import FeatureWriter

expectedFeatureText = """\
languagesystem DFLT dflt;
languagesystem latn dflt;

@lc = [a b c];

lookup mylookup {
    sub a by b;
} mylookup;

feature liga {
    sub f l by fl;
} liga;
"""


def test_featureWriter():
    w = FeatureWriter()
    w.addLanguageSystem("DFLT", "dflt")
    w.addLanguageSystem("latn", "dflt")
    w.addGroup("lc", ["a", "b", "c"])
    lookup = w.addLookup("mylookup")
    lookup.addLine("sub a by b")
    feature = w.addFeature("liga")
    feature.addLine("sub f l by fl")

    featureText = w.asFea()
    assert expectedFeatureText == featureText
