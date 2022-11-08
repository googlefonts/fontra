import pytest
from fontra.core.glyphnames import getSuggestedGlyphName


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
