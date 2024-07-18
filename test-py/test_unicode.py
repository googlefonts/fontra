import pytest

from fontra.core.unicode import decompose, usedBy


@pytest.mark.parametrize(
    "codePoint,expectedDecomposedCodePoints",
    [(ord("A"), []), (ord("Ä"), [ord("A"), 0x0308])],
)
def test_decompose(codePoint, expectedDecomposedCodePoints):
    decomposedCodePoints = decompose(codePoint)
    assert decomposedCodePoints == expectedDecomposedCodePoints


@pytest.mark.parametrize(
    "codePoint,expectedUsedByCodePoints",
    [(ord("#"), [0xFE5F, 0xFF03]), (ord("Ä"), []), (ord("$"), [0xFE69, 0xFF04])],
)
def test_usedBy(codePoint, expectedUsedByCodePoints):
    usedByCodePoints = usedBy(codePoint)
    assert usedByCodePoints == expectedUsedByCodePoints
