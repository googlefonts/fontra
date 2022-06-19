import argparse
from contextlib import contextmanager
from importlib import resources
from importlib.metadata import entry_points
import logging
import pathlib
from aiohttp import web
from .fonthandler import FontHandler


logger = logging.getLogger(__name__)


class FileSystemProjectManagerFactory:
    @staticmethod
    def addArguments(parser):
        parser.add_argument("root", type=existingFolder)
        parser.add_argument("--max-folder-depth", type=int, default=3)

    @staticmethod
    def getProjectManager(arguments):
        return FileSystemProjectManager(
            rootPath=arguments.root,
            maxFolderDepth=arguments.max_folder_depth,
        )


def existingFolder(path):
    path = pathlib.Path(path).resolve()
    if not path.is_dir():
        raise argparse.ArgumentError("not a directory")
    return path


def getFileSystemBackend(path):
    path = pathlib.Path(path)
    if not path.exists():
        raise FileNotFoundError(path)
    logger.info(f"loading project {path.name}...")
    fileType = path.suffix.lstrip(".").lower()
    backendEntryPoints = entry_points(group="fontra.filesystem.backends")
    entryPoint = backendEntryPoints[fileType]
    backendClass = entryPoint.load()

    backend = backendClass.fromPath(path)
    logger.info(f"done loading {path.name}")
    return backend


class FileSystemProjectManager:

    remoteMethodNames = {"getProjectList"}
    requireLogin = False

    def __init__(self, rootPath, maxFolderDepth=3):
        self.rootPath = rootPath
        self.maxFolderDepth = maxFolderDepth
        backendEntryPoints = entry_points(group="fontra.filesystem.backends")
        self.extensions = {f".{ep.name}" for ep in backendEntryPoints}
        self.fontHandlers = {}

    async def close(self):
        for fontHandler in self.fontHandlers.values():
            await fontHandler.close()

    @contextmanager
    def useConnection(self, connection):
        yield

    async def authorize(self, request):
        return "yes"  # arbitrary non-false string token

    async def projectPageHandler(self, request):
        html = resources.read_text("fontra.client", "landing.html")
        response = web.Response(text=html, content_type="text/html")
        response.set_cookie("fontra-require-login", "false")
        return response

    async def projectAvailable(self, token, path):
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
            backend = getFileSystemBackend(projectPath)
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
