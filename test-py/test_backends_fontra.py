import asyncio
import pathlib
import shutil
from contextlib import aclosing

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
def writableFontraFont(tmpdir):
    srcPath = commonFontsDir / "MutatorSans.fontra"
    dstPath = tmpdir / "MutatorSans.fontra"
    shutil.copytree(srcPath, dstPath)
    return getFileSystemBackend(dstPath)


@pytest.fixture
def newFontraFont(tmpdir):
    return newFileSystemBackend(tmpdir / "newfont.fontra")


async def test_copy_to_fontra(testDSFont, newFontraFont):
    async with aclosing(newFontraFont):
        await copyFont(testDSFont, newFontraFont)

    fontraFont = getFileSystemBackend(newFontraFont.path)

    for dstFont in [newFontraFont, fontraFont]:
        for glyphName in ["A", "B", "Q", "nlitest", "varcotest1"]:
            srcGlyph = await testDSFont.getGlyph(glyphName)
            dstGlyph = await dstFont.getGlyph(glyphName)
            assert srcGlyph == dstGlyph
        assert await testDSFont.getAxes() == await dstFont.getAxes()


async def test_fontraFormat(testFontraFont, newFontraFont):
    async with aclosing(newFontraFont):
        await copyFont(testFontraFont, newFontraFont)

    glyphMap = await newFontraFont.getGlyphMap()

    for glyphName in glyphMap:
        assert testFontraFont.getGlyphData(glyphName) == newFontraFont.getGlyphData(
            glyphName
        )
    assert await testFontraFont.getAxes() == await newFontraFont.getAxes()

    assert testFontraFont.fontDataPath.read_text(
        encoding="utf-8"
    ) == newFontraFont.fontDataPath.read_text(encoding="utf-8")

    assert testFontraFont.glyphInfoPath.read_text(
        encoding="utf-8"
    ) == newFontraFont.glyphInfoPath.read_text(encoding="utf-8")


async def test_deleteGlyph(writableFontraFont):
    glyphName = "A"
    assert writableFontraFont.getGlyphFilePath(glyphName).exists()
    assert await writableFontraFont.getGlyph(glyphName) is not None
    await writableFontraFont.deleteGlyph(glyphName)
    await asyncio.sleep(0.01)
    assert await writableFontraFont.getGlyph(glyphName) is None
    assert not writableFontraFont.getGlyphFilePath(glyphName).exists()
    reopenedFont = getFileSystemBackend(writableFontraFont.path)
    assert await reopenedFont.getGlyph(glyphName) is None


async def test_emptyFontraProject(tmpdir):
    path = tmpdir / "newfont.fontra"
    backend = newFileSystemBackend(path)
    await backend.aclose()

    backend = getFileSystemBackend(path)
    glyphMap = await backend.getGlyphMap()
    assert [] == list(glyphMap)
