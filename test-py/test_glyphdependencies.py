import pytest

from fontra.core.glyphdependencies import GlyphDependencies


@pytest.mark.parametrize(
    "updates, expectedUsedBy, expectedMadeOf",
    [
        ([], {}, {}),
        (
            [("Adieresis", ["A", "dieresis"])],
            {"A": {"Adieresis"}, "dieresis": {"Adieresis"}},
            {"Adieresis": {"A", "dieresis"}},
        ),
        (
            [
                ("Adieresis", ["A", "dieresis"]),
                ("Agrave", ["A", "grave"]),
                ("Adieresis", ["A", "foo"]),
            ],
            {"A": {"Adieresis", "Agrave"}, "foo": {"Adieresis"}, "grave": {"Agrave"}},
            {"Adieresis": {"A", "foo"}, "Agrave": {"A", "grave"}},
        ),
        (
            [("Adieresis", ["A", "dieresis"]), ("Adieresis", [])],
            {},
            {},
        ),
    ],
)
def test_glyphdependencies(updates, expectedUsedBy, expectedMadeOf):
    deps = GlyphDependencies()
    for glyphName, componentNames in updates:
        deps.update(glyphName, componentNames)
    assert expectedUsedBy == deps.usedBy
    assert expectedMadeOf == deps.madeOf
