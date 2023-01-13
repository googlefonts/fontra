from contextlib import asynccontextmanager
import pathlib
import shutil
import pytest
from fontra.core.fonthandler import FontHandler
from fontra.backends.designspace import DesignspaceBackend


@asynccontextmanager
async def asyncClosing(thing):
    try:
        yield thing
    finally:
        await thing.close()


mutatorSansDir = pathlib.Path(__file__).resolve().parent / "data" / "mutatorsans"

dsFileName = "MutatorSans.designspace"
mutatorFiles = [
    dsFileName,
    "MutatorSans.designspace",
    "MutatorSansBoldCondensed.ufo",
    "MutatorSansBoldWide.ufo",
    "MutatorSansLightCondensed.ufo",
    "MutatorSansLightWide.ufo",
]


@pytest.fixture(scope="session")
def testFontPath(tmp_path_factory):
    tmpDir = tmp_path_factory.mktemp("font")
    for fn in mutatorFiles:
        srcPath = mutatorSansDir / fn
        dstPath = tmpDir / fn
        if srcPath.is_dir():
            shutil.copytree(srcPath, dstPath)
        else:
            shutil.copy(srcPath, dstPath)
    return tmpDir / dsFileName


@pytest.fixture
async def testFontHandler(testFontPath):
    assert testFontPath.exists(), testFontPath
    backend = DesignspaceBackend.fromPath(testFontPath)
    return FontHandler(backend)


@pytest.mark.asyncio
async def test_fontHandler_basic(testFontHandler):
    async with asyncClosing(testFontHandler):
        # await testFontHandler.start()
        glyph = await testFontHandler.getGlyph("A", connection=None)
        assert "LightCondensed/foreground" == glyph.layers[0].name
        assert 32 == len(glyph.layers[0].glyph.path.coordinates)
