import pathlib

from fontra.backends import getFileSystemBackend

dataDir = pathlib.Path(__file__).resolve().parent / "data"
workflowPath = dataDir / "mutatorsans" / "MutatorSans_workflow.yaml"


async def test_workflow_backend():
    backend = getFileSystemBackend(workflowPath)

    glyphMap = await backend.getGlyphMap()

    assert {"A": [65, 97], "B": [66, 98]} == glyphMap

    glyph = await backend.getGlyph("A")
    assert glyph is not None

    glyph = await backend.getGlyph("C")
    assert glyph is None
