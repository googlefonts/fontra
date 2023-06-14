import pathlib
import shutil

import pytest

from fontra.backends.designspace import DesignspaceBackend

dataDir = pathlib.Path(__file__).resolve().parent / "data"


@pytest.fixture
def writableTestFont(tmpdir):
    mutatorPath = dataDir / "mutatorsans"
    for sourcePath in mutatorPath.iterdir():
        if sourcePath.suffix not in {".designspace", ".ufo"}:
            continue
        destPath = tmpdir / sourcePath.name
        if sourcePath.is_dir():
            shutil.copytree(sourcePath, destPath)
        else:
            shutil.copy(sourcePath, destPath)
    return DesignspaceBackend.fromPath(tmpdir / "MutatorSans.designspace")


def readGLIFData(glyphName, glyphSets):
    return {
        layerName: glyphSet.getGLIF(glyphName).decode("utf-8")
        for layerName, glyphSet in glyphSets.items()
        if glyphName in glyphSet
    }


@pytest.mark.parametrize("glyphName", ["A", "B", "Q", "varcotest1", "varcotest2"])
async def test_roundTripGlyph(writableTestFont, glyphName):
    existingData = readGLIFData(glyphName, writableTestFont.ufoGlyphSets)
    glyphMap = await writableTestFont.getGlyphMap()
    glyph = await writableTestFont.getGlyph(glyphName)

    await writableTestFont.putGlyph(glyphName, glyph, glyphMap[glyphName])

    newData = readGLIFData(glyphName, writableTestFont.ufoGlyphSets)
    for layerName in existingData:
        assert existingData[layerName] == newData[layerName], layerName
    assert existingData == newData  # just in case the keys differ
