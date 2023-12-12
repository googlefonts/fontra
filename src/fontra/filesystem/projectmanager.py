import argparse
import logging
import pathlib
from importlib import resources
from importlib.metadata import entry_points
from os import PathLike
from types import SimpleNamespace
from typing import Callable

from aiohttp import web

from ..backends import getFileSystemBackend
from ..core.fonthandler import FontHandler
from ..core.protocols import ProjectManager

logger = logging.getLogger(__name__)


fileExtensions = {
    f".{ep.name}" for ep in entry_points(group="fontra.filesystem.backends")
}


class FileSystemProjectManagerFactory:
    @staticmethod
    def addArguments(parser: argparse.ArgumentParser) -> None:
        parser.add_argument(
            "path",
            type=existingFolderOrFontFile,
            help="A path to an folder containing font files, or a path to a "
            "single font file. Alternatively you can pass the special value "
            "'-' to bypass the landing page, and use a full OS FS path as part "
            "of the view URL.",
        )
        parser.add_argument("--max-folder-depth", type=int, default=3)
        parser.add_argument("--read-only", action="store_true")

    @staticmethod
    def getProjectManager(arguments: SimpleNamespace) -> ProjectManager:
        return FileSystemProjectManager(
            rootPath=arguments.path,
            maxFolderDepth=arguments.max_folder_depth,
            readOnly=arguments.read_only,
        )


def existingFolderOrFontFile(path):
    if path == "-":
        return None
    path = pathlib.Path(path).resolve()
    ext = path.suffix.lower()
    if ext not in fileExtensions and not path.is_dir():
        raise argparse.ArgumentError("invalid path")
    return path


class FileSystemProjectManager:
    def __init__(
        self,
        rootPath: pathlib.Path | None,
        maxFolderDepth: int = 3,
        readOnly: bool = False,
    ):
        self.rootPath = rootPath
        self.singleFilePath = None
        self.maxFolderDepth = maxFolderDepth
        self.readOnly = readOnly
        if self.rootPath is not None and self.rootPath.suffix.lower() in fileExtensions:
            self.singleFilePath = self.rootPath
            self.rootPath = self.rootPath.parent
        self.fontHandlers: dict[str, FontHandler] = {}

    async def close(self) -> None:
        for fontHandler in self.fontHandlers.values():
            await fontHandler.close()

    async def authorize(self, request: web.Request) -> str:
        return "yes"  # arbitrary non-false string token

    async def projectPageHandler(
        self, request: web.Request, filterContent: Callable | None = None
    ) -> web.Response:
        htmlPath = resources.files("fontra") / "filesystem" / "landing.html"
        html = htmlPath.read_text()
        if filterContent is not None:
            html = filterContent(html, "text/html")
        return web.Response(text=html, content_type="text/html")

    async def projectAvailable(self, path: str, token: str) -> bool:
        return bool(self._getProjectPath(path))

    async def getRemoteSubject(self, path: str, token: str) -> FontHandler:
        assert path[0] == "/"
        path = path[1:]
        fontHandler = self.fontHandlers.get(path)
        if fontHandler is None:
            projectPath = self._getProjectPath(path)
            if projectPath is None:
                raise FileNotFoundError(projectPath)
            backend = getFileSystemBackend(projectPath)

            async def closeFontHandler():
                logger.info(f"closing FontHandler for '{path}'")
                del self.fontHandlers[path]
                await fontHandler.close()

            logger.info(f"new FontHandler for '{path}'")
            fontHandler = FontHandler(
                backend,
                readOnly=self.readOnly,
                allConnectionsClosedCallback=closeFontHandler,
            )
            await fontHandler.startTasks()
            self.fontHandlers[path] = fontHandler
        return fontHandler

    def _getProjectPath(self, path: str) -> PathLike | None:
        if self.rootPath is None:
            projectPath = pathlib.Path(path)
            if not projectPath.is_absolute():
                projectPath = "/" / projectPath
        else:
            projectPath = self.rootPath
            for pathItem in path.split("/"):
                projectPath = projectPath.joinpath(pathItem)

        if projectPath.suffix.lower() in fileExtensions and projectPath.exists():
            return projectPath
        return None

    async def getProjectList(self, token: str) -> list[str]:
        if self.rootPath is None:
            return []
        projectPaths = []
        rootItems = self.rootPath.parts
        if self.singleFilePath is not None:
            paths = [self.singleFilePath]
        else:
            paths = sorted(
                _iterFolder(self.rootPath, fileExtensions, self.maxFolderDepth)
            )
        for projectPath in paths:
            projectItems = projectPath.parts
            assert projectItems[: len(rootItems)] == rootItems
            projectPaths.append("/".join(projectItems[len(rootItems) :]))
        return projectPaths


def _iterFolder(folderPath, extensions, maxDepth=3):
    if maxDepth is not None and maxDepth <= 0:
        return
    try:
        for childPath in folderPath.iterdir():
            if childPath.suffix.lower() in extensions:
                yield childPath
            elif childPath.is_dir():
                yield from _iterFolder(
                    childPath,
                    extensions,
                    maxDepth - 1 if maxDepth is not None else None,
                )
    except PermissionError:
        logger.info(f"Skipping {str(folderPath)!r} (no permission)")
