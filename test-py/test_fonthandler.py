import asyncio
from contextlib import asynccontextmanager
import logging
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
        # await testFontHandler.startTasks()
        glyph = await testFontHandler.getGlyph("A", connection=None)

    assert "LightCondensed/foreground" == glyph.layers[0].name
    assert 32 == len(glyph.layers[0].glyph.path.coordinates)
    assert 20 == glyph.layers[0].glyph.path.coordinates[0]


@pytest.mark.asyncio
async def test_fontHandler_externalChange(testFontHandler):
    async with asyncClosing(testFontHandler):
        await testFontHandler.startTasks()
        glyph = await testFontHandler.getGlyph("A")
        assert 20 == glyph.layers[0].glyph.path.coordinates[0]

        dsDoc = testFontHandler.backend.dsDoc
        ufoPath = pathlib.Path(dsDoc.sources[0].path)
        glifPath = ufoPath / "glyphs" / "A_.glif"
        glifData = glifPath.read_text()
        glifData = glifData.replace('x="20"', 'x="-100"')
        glifPath.write_text(glifData)

        # We should see the "before", as it's cached
        glyph = await testFontHandler.getGlyph("A")
        assert 20 == glyph.layers[0].glyph.path.coordinates[0]

        await asyncio.sleep(0.3)

        # We should see the "after", because the external change
        # watcher cleared the cache
        glyph = await testFontHandler.getGlyph("A")
        assert -100 == glyph.layers[0].glyph.path.coordinates[0]


@pytest.mark.asyncio
async def test_fontHandler_editGlyph(testFontHandler):
    async with asyncClosing(testFontHandler):
        await testFontHandler.startTasks()
        glyph = await testFontHandler.getGlyph("A", connection=None)
        assert 0 == glyph.layers[0].glyph.path.coordinates[1]

        change = {
            "p": ["glyphs", "A", "layers", 0, "glyph", "path"],
            "f": "=xy",
            "a": [0, 20, 55],
        }
        rollbackChange = {
            "p": ["glyphs", "A", "layers", 0, "glyph", "path"],
            "f": "=xy",
            "a": [0, 20, 0],
        }

        await testFontHandler.editFinal(
            change, rollbackChange, "Test edit", False, connection=None
        )

        glyph = await testFontHandler.getGlyph("A", connection=None)
        assert [20, 55] == glyph.layers[0].glyph.path.coordinates[:2]

        # give the write queue the opportunity to complete
        await testFontHandler.finishWriting()

        dsDoc = testFontHandler.backend.dsDoc
        ufoPath = pathlib.Path(dsDoc.sources[0].path)
        glifPath = ufoPath / "glyphs" / "A_.glif"
        glifData = glifPath.read_text()
        expectedLine = """<point x="20" y="55" type="line"/>"""
        assert expectedLine in glifData

    # give the event loop a moment to clean up
    await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_fontHandler_getData(testFontHandler):
    async with asyncClosing(testFontHandler):
        unitsPerEm = await testFontHandler.getData("unitsPerEm")
        assert 1000 == unitsPerEm


@pytest.mark.asyncio
async def test_fontHandler_setData(testFontHandler, caplog):
    caplog.set_level(logging.INFO)
    async with asyncClosing(testFontHandler):
        glyphMap = await testFontHandler.getData("glyphMap")
        assert [65, 97] == glyphMap["A"]
        change = {
            "p": ["glyphMap"],
            "f": "=",
            "a": ["A", [97]],
        }
        rollbackChange = {
            "p": ["glyphMap"],
            "f": "=",
            "a": ["A", [65, 97]],
        }
        await testFontHandler.editFinal(
            change, rollbackChange, "Test edit", False, connection=None
        )

        glyphMap = await testFontHandler.getData("glyphMap")
        assert [97] == glyphMap["A"]
    assert "No backend write method found for glyphMap" == caplog.records[0].message


@pytest.mark.asyncio
async def test_fontHandler_setData_unitsPerEm(testFontHandler, caplog):
    caplog.set_level(logging.INFO)
    async with asyncClosing(testFontHandler):
        unitsPerEm = await testFontHandler.getData("unitsPerEm")
        assert 1000 == unitsPerEm
        change = {
            "f": "=",
            "a": ["unitsPerEm", 2000],
        }
        rollbackChange = {
            "f": "=",
            "a": ["unitsPerEm", 1000],
        }
        await testFontHandler.editFinal(
            change, rollbackChange, "Test edit", False, connection=None
        )

        unitsPerEm = await testFontHandler.getData("unitsPerEm")
        assert 2000 == unitsPerEm

    assert "No backend write method found for unitsPerEm" == caplog.records[0].message


@pytest.mark.asyncio
async def test_fontHandler_new_glyph(testFontHandler):
    async with asyncClosing(testFontHandler):
        await testFontHandler.startTasks()

        newGlyphName = "testglyph"

        dsDoc = testFontHandler.backend.dsDoc
        ufoPath = pathlib.Path(dsDoc.sources[0].path)
        glifPath = ufoPath / "glyphs" / f"{newGlyphName}.glif"
        assert not glifPath.exists()

        newGlyph = {
            "name": newGlyphName,
            "axes": [],
            "sources": [
                {
                    "location": {},
                    "name": "LightCondensed",
                    "layerName": "LightCondensed/foreground",
                }
            ],
            "layers": [
                {
                    "name": "LightCondensed/foreground",
                    "glyph": {
                        "xAdvance": 170,
                        "yAdvance": None,
                        "verticalOrigin": None,
                        "path": {
                            "contourInfo": [{"endPoint": 3, "isClosed": True}],
                            "coordinates": [60, 0, 110, 0, 110, 120, 60, 120],
                            "pointTypes": [0, 0, 0, 0],
                        },
                        "components": [],
                    },
                },
            ],
        }

        glyph = await testFontHandler.getGlyph(newGlyphName)
        assert glyph is None
        change = {
            "p": ["glyphs"],
            "f": "=",
            "a": [newGlyphName, newGlyph],
        }
        rollbackChange = {
            "p": ["glyphs"],
            "f": "-",
            "a": [newGlyphName, 1000],
        }

        await testFontHandler.editFinal(
            change, rollbackChange, "Test edit", False, connection=None
        )

        await testFontHandler.finishWriting()
        assert glifPath.exists()
