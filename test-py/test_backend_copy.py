import pathlib
import subprocess

from test_backend_designspace import fileNamesFromDir

from fontra.backends import getFileSystemBackend, newFileSystemBackend
from fontra.backends.copy import copyFont

mutatorDSPath = (
    pathlib.Path(__file__).resolve().parent
    / "data"
    / "mutatorsans"
    / "MutatorSans.designspace"
)


async def test_copyFont(tmpdir):
    tmpdir = pathlib.Path(tmpdir)
    destPath = tmpdir / "MutatorCopy.designspace"
    sourceFont = getFileSystemBackend(mutatorDSPath)
    destFont = newFileSystemBackend(destPath)
    await copyFont(sourceFont, destFont)
    assert [
        "MutatorCopy.designspace",
        "MutatorCopy_BoldCondensed.ufo",
        "MutatorCopy_BoldWide.ufo",
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
        "MutatorCopy_LightWide.ufo",
        "MutatorCopy_Regular.ufo",
    ] == fileNamesFromDir(tmpdir)
