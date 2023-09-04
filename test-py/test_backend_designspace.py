import pathlib
import shutil
from dataclasses import asdict

import pytest
from fontTools.designspaceLib import DesignSpaceDocument

from fontra.backends import newFileSystemBackend
from fontra.backends.designspace import DesignspaceBackend, UFOBackend
from fontra.core.classes import GlobalAxis, Layer, LocalAxis, Source, StaticGlyph

dataDir = pathlib.Path(__file__).resolve().parent / "data"


@pytest.fixture
def testFont():
    return DesignspaceBackend.fromPath(
        dataDir / "mutatorsans" / "MutatorSans.designspace"
    )


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


@pytest.fixture
def writableTestFontSingleUFO(tmpdir):
    sourcePath = dataDir / "mutatorsans" / "MutatorSansLightCondensed.ufo"
    destPath = tmpdir / sourcePath.name
    shutil.copytree(sourcePath, destPath)
    return UFOBackend.fromPath(destPath)


def readGLIFData(glyphName, ufoLayers):
    glyphSets = {layer.fontraLayerName: layer.glyphSet for layer in ufoLayers}
    return {
        layerName: glyphSet.getGLIF(glyphName).decode("utf-8")
        for layerName, glyphSet in glyphSets.items()
        if glyphName in glyphSet
    }


@pytest.mark.parametrize(
    "glyphName", ["A", "B", "Q", "R.alt", "varcotest1", "varcotest2"]
)
async def test_roundTripGlyph(writableTestFont, glyphName):
    existingData = readGLIFData(glyphName, writableTestFont.ufoLayers)
    glyphMap = await writableTestFont.getGlyphMap()
    glyph = await writableTestFont.getGlyph(glyphName)

    await writableTestFont.putGlyph(glyphName, glyph, glyphMap[glyphName])

    newData = readGLIFData(glyphName, writableTestFont.ufoLayers)
    for layerName in existingData:
        assert existingData[layerName] == newData[layerName], layerName
    assert existingData == newData  # just in case the keys differ


@pytest.mark.parametrize("glyphName", ["A"])
async def test_roundTripGlyphSingleUFO(writableTestFontSingleUFO, glyphName):
    existingData = readGLIFData(glyphName, writableTestFontSingleUFO.ufoLayers)
    glyphMap = await writableTestFontSingleUFO.getGlyphMap()
    glyph = await writableTestFontSingleUFO.getGlyph(glyphName)

    await writableTestFontSingleUFO.putGlyph(glyphName, glyph, glyphMap[glyphName])

    newData = readGLIFData(glyphName, writableTestFontSingleUFO.ufoLayers)
    for layerName in existingData:
        assert existingData[layerName] == newData[layerName], layerName
    assert existingData == newData  # just in case the keys differ


@pytest.mark.parametrize(
    "location, expectedDSSource",
    [
        (
            {"weight": 400, "width": 0},
            dict(
                location=dict(weight=400, width=0),
                styleName="mid",
                filename="MutatorSansLightCondensed.ufo",
                layerName="mid",
            ),
        ),
        (
            {"weight": 400, "width": 1000},
            dict(
                location=dict(weight=400, width=1000),
                styleName="mid",
                filename="MutatorSansLightWide.ufo",
                layerName="mid",
            ),
        ),
    ],
)
async def test_addNewSparseSource(writableTestFont, location, expectedDSSource):
    glyphName = "A"
    glyphMap = await writableTestFont.getGlyphMap()
    glyph = await writableTestFont.getGlyph(glyphName)
    dsSources = unpackSources(writableTestFont.dsDoc.sources)

    glyph.sources.append(Source(name="mid", location=location, layerName="mid"))
    glyph.layers["mid"] = Layer(glyph=StaticGlyph())

    await writableTestFont.putGlyph(glyphName, glyph, glyphMap[glyphName])

    newDSDoc = DesignSpaceDocument.fromfile(writableTestFont.dsDoc.path)
    newDSSources = unpackSources(newDSDoc.sources)
    assert dsSources == newDSSources[: len(dsSources)]
    assert len(newDSSources) == len(dsSources) + 1
    assert newDSSources[-1] == expectedDSSource


async def test_addNewDenseSource(writableTestFont):
    glyphName = "A"
    assert writableTestFont.dsDoc.axes[0].name == "width"

    # Move the width axis maximum
    writableTestFont.dsDoc.axes[0].maximum = 1500
    writableTestFont.__init__(writableTestFont.dsDoc)  # hacky reload from ds doc

    glyphMap = await writableTestFont.getGlyphMap()
    glyph = await writableTestFont.getGlyph(glyphName)
    dsSources = unpackSources(writableTestFont.dsDoc.sources)

    glyph.sources.append(
        Source(name="widest", location={"width": 1500}, layerName="widest")
    )
    glyph.layers["widest"] = Layer(glyph=StaticGlyph())

    await writableTestFont.putGlyph(glyphName, glyph, glyphMap[glyphName])

    newDSDoc = DesignSpaceDocument.fromfile(writableTestFont.dsDoc.path)
    newDSSources = unpackSources(newDSDoc.sources)
    assert dsSources == newDSSources[: len(dsSources)]
    assert len(newDSSources) == len(dsSources) + 1
    assert newDSSources[-1] == dict(
        location=dict(weight=150, width=1500),
        styleName="widest",
        filename="MutatorSans_widest.ufo",
        layerName="public.default",
    )


async def test_addLocalAxis(writableTestFont):
    glyphName = "period"
    glyphMap = await writableTestFont.getGlyphMap()
    glyph = await writableTestFont.getGlyph(glyphName)

    glyph.axes.append(LocalAxis(name="test", minValue=0, defaultValue=50, maxValue=100))

    await writableTestFont.putGlyph(glyphName, glyph, glyphMap[glyphName])

    savedGlyph = await writableTestFont.getGlyph(glyphName)

    assert asdict(glyph) == asdict(savedGlyph)


async def test_addLocalAxisAndSource(writableTestFont):
    glyphName = "period"
    glyphMap = await writableTestFont.getGlyphMap()
    glyph = await writableTestFont.getGlyph(glyphName)

    layerName = "test"

    glyph.axes.append(LocalAxis(name="test", minValue=0, defaultValue=50, maxValue=100))
    glyph.sources.append(
        Source(name="test", location={"test": 100}, layerName=layerName)
    )
    glyph.layers[layerName] = Layer(glyph=StaticGlyph(xAdvance=0))

    await writableTestFont.putGlyph(glyphName, glyph, glyphMap[glyphName])

    savedGlyph = await writableTestFont.getGlyph(glyphName)

    assert asdict(glyph) == asdict(savedGlyph)


async def test_putGlobalAxes(writableTestFont):
    axes = await writableTestFont.getGlobalAxes()
    axes.append(
        GlobalAxis(
            name="Testing",
            tag="TEST",
            label="Testing",
            minValue=10,
            defaultValue=20,
            maxValue=30,
            mapping=[[10, 0], [20, 100], [20, 200]],
        )
    )
    await writableTestFont.putGlobalAxes(axes)

    path = writableTestFont.dsDoc.path
    newFont = DesignspaceBackend.fromPath(path)
    newAxes = await newFont.getGlobalAxes()
    assert axes == newAxes


async def test_newFileSystemBackend(tmpdir, testFont):
    tmpdir = pathlib.Path(tmpdir)
    dsPath = tmpdir / "Test.designspace"
    font = newFileSystemBackend(dsPath)
    assert [] == await font.getGlobalAxes()
    assert ["Test.designspace", "Test_Regular.ufo"] == fileNamesFromDir(tmpdir)

    axes = await testFont.getGlobalAxes()
    await font.putGlobalAxes(axes)
    glyphMap = await testFont.getGlyphMap()
    glyph = await testFont.getGlyph("A")
    await font.putGlyph("A", glyph, glyphMap["A"])

    assert ["A_.glif", "contents.plist"] == fileNamesFromDir(
        tmpdir / "Test_Regular.ufo" / "glyphs"
    )

    assert [
        "fontinfo.plist",
        "glyphs",
        "glyphs.M_utatorS_ansL_ightC_ondensed_support",
        "layercontents.plist",
        "metainfo.plist",
    ] == fileNamesFromDir(tmpdir / "Test_Regular.ufo")

    assert [
        "Test.designspace",
        "Test_BoldCondensed.ufo",
        "Test_BoldWide.ufo",
        "Test_LightWide.ufo",
        "Test_Regular.ufo",
    ] == fileNamesFromDir(tmpdir)

    newGlyph = await font.getGlyph("A")
    assert glyph == newGlyph

    # Check with freshly opened font
    referenceFont = DesignspaceBackend.fromPath(dsPath)
    referenceGlyph = await referenceFont.getGlyph("A")
    assert glyph == referenceGlyph


def fileNamesFromDir(path):
    return sorted(p.name for p in path.iterdir())


def unpackSources(sources):
    return [
        {k: getattr(s, k) for k in ["location", "styleName", "filename", "layerName"]}
        for s in sources
    ]
