import pytest
from fontra.core.glyphnames import getSuggestedGlyphName, getUnicodeFromGlyphName


@pytest.mark.parametrize(
    "codePoint, expectedGlyphName",
    [
        (ord("A"), "A"),
        (ord("Å"), "Aring"),
        (ord("$"), "dollar"),
        (ord("א"), "alef-hb"),
        (ord("갏"), "galh-ko"),
        (ord("㕍"), "uni354D"),
        (0x12345, "u12345"),
    ],
)
def test_getSuggestedGlyphName(codePoint, expectedGlyphName):
    assert expectedGlyphName == getSuggestedGlyphName(codePoint)


@pytest.mark.parametrize(
    "glyphName, expectedCodePoint",
    [
        ("A", ord("A")),
        ("Aring", ord("Å")),
        ("dollar", ord("$")),
        ("alef-hb", ord("א")),
        ("galh-ko", ord("갏")),
        ("uni354D", ord("㕍")),
        ("u12345", 0x12345),
        ("universe", None),
        ("ugly", None),
        ("blahblah", None),
    ],
)
def test_getUnicodeFromGlyphName(glyphName, expectedCodePoint):
    assert expectedCodePoint == getUnicodeFromGlyphName(glyphName)
