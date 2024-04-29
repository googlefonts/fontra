import pathlib
import subprocess

import pytest
from test_backends_designspace import fileNamesFromDir

from fontra.backends import getFileSystemBackend, newFileSystemBackend
from fontra.backends.copy import copyFont

mutatorDSPath = (
    pathlib.Path(__file__).resolve().parent
    / "data"
    / "mutatorsans"
    / "MutatorSans.designspace"
)


@pytest.mark.parametrize("glyphNames", [None, ["A", "period"]])
async def test_copyFont(tmpdir, glyphNames):
    tmpdir = pathlib.Path(tmpdir)
    destPath = tmpdir / "MutatorCopy.designspace"
    sourceFont = getFileSystemBackend(mutatorDSPath)
    destFont = newFileSystemBackend(destPath)
    await copyFont(sourceFont, destFont, glyphNames=glyphNames)
    assert [
        "MutatorCopy.designspace",
        "MutatorCopy_BoldCondensed.ufo",
        "MutatorCopy_BoldWide.ufo",
        "MutatorCopy_LightCondensedItalic.ufo",
        "MutatorCopy_LightWide.ufo",
        "MutatorCopy_Regular.ufo",
    ] == fileNamesFromDir(tmpdir)


def test_fontra_copy(tmpdir):
    tmpdir = pathlib.Path(tmpdir)
    destPath = tmpdir / "MutatorCopy.designspace"
    subprocess.run(["fontra-copy", mutatorDSPath, destPath])
    assert [
        "MutatorCopy.designspace",
        "MutatorCopy_BoldCondensed.ufo",
        "MutatorCopy_BoldWide.ufo",
        "MutatorCopy_LightCondensedItalic.ufo",
        "MutatorCopy_LightWide.ufo",
        "MutatorCopy_Regular.ufo",
    ] == fileNamesFromDir(tmpdir)
