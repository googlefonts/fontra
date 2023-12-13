import pathlib
from os import PathLike

from fontra.backends.designspace import DesignspaceBackend, UFOBackend
from fontra.backends.fontra import FontraBackend
from fontra.backends.opentype import OTFBackend
from fontra.core.protocols import (
    ProjectManagerFactory,
    ReadableFontBackend,
    WritableFontBackend,
)
from fontra.filesystem.projectmanager import FileSystemProjectManagerFactory

repoRoot = pathlib.Path(__file__).resolve().parent.parent


def test_designspace_read() -> None:
    backend: ReadableFontBackend = DesignspaceBackend.fromPath(
        repoRoot / "test-py" / "data" / "mutatorsans" / "MutatorSans.designspace"
    )
    assert isinstance(backend, ReadableFontBackend)


def test_designspace_write(tmpdir: PathLike) -> None:
    tmpdir = pathlib.Path(tmpdir)
    backend: WritableFontBackend = DesignspaceBackend.createFromPath(
        tmpdir / "Test.designspace"
    )
    assert isinstance(backend, WritableFontBackend)


def test_ufo_read() -> None:
    backend: ReadableFontBackend = UFOBackend.fromPath(
        repoRoot / "test-py" / "data" / "mutatorsans" / "MutatorSansLightCondensed.ufo"
    )
    assert isinstance(backend, ReadableFontBackend)


def test_ufo_write(tmpdir: PathLike) -> None:
    tmpdir = pathlib.Path(tmpdir)
    backend: WritableFontBackend = UFOBackend.createFromPath(tmpdir / "Test.ufo")
    assert isinstance(backend, WritableFontBackend)


def test_fontra_read() -> None:
    backend: ReadableFontBackend = FontraBackend.fromPath(
        repoRoot / "test-common" / "fonts" / "MutatorSans.fontra"
    )
    assert isinstance(backend, ReadableFontBackend)


def test_fontra_write(tmpdir: PathLike) -> None:
    tmpdir = pathlib.Path(tmpdir)
    backend: WritableFontBackend = FontraBackend.createFromPath(tmpdir / "Test.fontra")
    assert isinstance(backend, WritableFontBackend)


def test_opentype_read() -> None:
    backend: ReadableFontBackend = OTFBackend.fromPath(
        repoRoot / "test-py" / "data" / "mutatorsans" / "MutatorSans.ttf"
    )
    assert isinstance(backend, ReadableFontBackend)


def test_FileSystemProjectManagerFactory() -> None:
    factory: ProjectManagerFactory = FileSystemProjectManagerFactory()
    assert isinstance(factory, ProjectManagerFactory)
