import pathlib
from contextlib import closing

import pytest

from fontra.backends import getFileSystemBackend, newFileSystemBackend
from fontra.backends.copy import copyFont

dataDir = pathlib.Path(__file__).resolve().parent / "data"
commonFontsDir = pathlib.Path(__file__).parent.parent / "test-common" / "fonts"


@pytest.fixture
def testDSFont():
    return getFileSystemBackend(dataDir / "mutatorsans" / "MutatorSans.designspace")


@pytest.fixture
def testFontraFont():
    return getFileSystemBackend(commonFontsDir / "MutatorSans.fontra")


@pytest.fixture
def newFontraFont(tmpdir):
    return newFileSystemBackend(tmpdir / "newfont.fontra")


async def test_copy_to_fontra(testDSFont, newFontraFont):
    with closing(newFontraFont):
        await copyFont(testDSFont, newFontraFont)

    fontraFont = getFileSystemBackend(newFontraFont.path)

    for dstFont in [newFontraFont, fontraFont]:
        for glyphName in ["A", "B", "Q", "nlitest", "varcotest1"]:
            srcGlyph = await testDSFont.getGlyph(glyphName)
            dstGlyph = await dstFont.getGlyph(glyphName)
            assert srcGlyph == dstGlyph


async def test_fontraFormat(testFontraFont, newFontraFont):
    with closing(newFontraFont):
        await copyFont(testFontraFont, newFontraFont)

    glyphMap = await newFontraFont.getGlyphMap()

    for glyphName in glyphMap:
        assert testFontraFont.getGlyphData(glyphName) == newFontraFont.getGlyphData(
            glyphName
        )

    assert testFontraFont.fontDataPath.read_text(
        encoding="utf-8"
    ) == newFontraFont.fontDataPath.read_text(encoding="utf-8")

    assert testFontraFont.glyphInfoPath.read_text(
        encoding="utf-8"
    ) == newFontraFont.glyphInfoPath.read_text(encoding="utf-8")
