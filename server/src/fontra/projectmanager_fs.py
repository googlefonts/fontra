from contextlib import contextmanager
import logging
import pathlib
import secrets
from .backends import getBackendClass
from .fonthandler import FontHandler


logger = logging.getLogger(__name__)


async def getFileSystemBackend(path):
    path = pathlib.Path(path)
    if not path.exists():
        raise FileNotFoundError(path)
    logger.info(f"loading project {path.name}...")
    fileType = path.suffix.lstrip(".")
    backendClass = getBackendClass(fileType)
    backend = backendClass.fromPath(path)
    logger.info(f"done loading {path.name}")
    return backend


class FileSystemProjectManager:

    remoteMethodNames = {"getProjectList"}
    requireLogin = False

    def __init__(self, rootPath, maxFolderDepth=3):
        self.rootPath = rootPath
        self.maxFolderDepth = maxFolderDepth
        self.extensions = {".designspace", ".ufo", ".rcjk"}
        self.fontHandlers = {}

    async def close(self):
        pass

    @contextmanager
    def useConnection(self, connection):
        yield

    async def login(self, username, password):
        # dummy, for testing
        if password == "a":
            return secrets.token_hex(32)
        return None

    def projectAvailable(self, token, path):
        projectPath = self.rootPath.joinpath(*path.split("/"))
        return projectPath.exists()

    async def getRemoteSubject(self, path, token, remoteIP):
        if path == "/":
            return self

        assert path[0] == "/"
        path = path[1:]
        fontHandler = self.fontHandlers.get(path)
        if fontHandler is None:
            projectPath = self.rootPath.joinpath(*path.split("/"))
            if not projectPath.exists():
                raise FileNotFoundError(projectPath)
            backend = await getFileSystemBackend(projectPath)
            fontHandler = FontHandler(backend)
            self.fontHandlers[path] = fontHandler
        return fontHandler

    async def getProjectList(self, *, connection):
        projectPaths = []
        rootItems = self.rootPath.parts
        paths = sorted(_iterFolder(self.rootPath, self.extensions, self.maxFolderDepth))
        for projectPath in paths:
            projectItems = projectPath.parts
            assert projectItems[: len(rootItems)] == rootItems
            projectPaths.append("/".join(projectItems[len(rootItems) :]))
        return projectPaths


def _iterFolder(folderPath, extensions, maxDepth=3):
    if maxDepth is not None and maxDepth <= 0:
        return
    for childPath in folderPath.iterdir():
        if childPath.suffix.lower() in extensions:
            yield childPath
        elif childPath.is_dir():
            yield from _iterFolder(
                childPath, extensions, maxDepth - 1 if maxDepth is not None else None
            )
