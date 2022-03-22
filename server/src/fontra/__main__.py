import argparse
import logging
import pathlib
from urllib.parse import urlsplit, urlunsplit
import sys
from .backends import getBackendClass
from .fonthandler import FontHandler
from .server import FontraServer


async def getMySQLBackend(url):
    from .backends.rcjkmysql import RCJKMySQLBackend

    parsed = urlsplit(url)
    displayURL = urlunsplit([parsed.scheme, parsed.hostname, parsed.path, None, None])
    print(f"connecting to project {displayURL}...")
    return await RCJKMySQLBackend.fromURL(url)


async def getFileSystemBackend(path):
    path = pathlib.Path(path)
    if not path.exists():
        raise FileNotFoundError(path)
    print(f"loading project {path.name}...")
    fileType = path.suffix.lstrip(".")
    backendClass = getBackendClass(fileType)
    return backendClass.fromPath(path)


class FileSystemProjectManager:

    remoteMethodNames = {"getProjectList"}
    requireLogin = False

    def __init__(self, rootPath, maxFolderDepth=3):
        self.rootPath = rootPath
        self.maxFolderDepth = maxFolderDepth
        self.extensions = {".designspace", ".ufo", ".rcjk"}
        self.fontHandlers = {}
        self.clients = {}

    def projectExists(self, *pathItems):
        projectPath = self.rootPath.joinpath(*pathItems)
        return projectPath.exists()

    async def getRemoteSubject(self, path, token, remoteIP):
        if path == "/":
            return self
        pathItems = tuple(path.split("/"))
        assert pathItems[0] == ""
        pathItems = pathItems[1:]
        assert all(item for item in pathItems)
        fontHandler = self.fontHandlers.get(pathItems)
        if fontHandler is None:
            projectPath = self.rootPath.joinpath(*pathItems)
            if not projectPath.exists():
                raise FileNotFoundError(projectPath)
            backend = await getFileSystemBackend(projectPath)
            fontHandler = FontHandler(backend, self.clients)
            self.fontHandlers[pathItems] = fontHandler
        return fontHandler

    async def getProjectList(self, *, client):
        projectPaths = []
        rootItems = self.rootPath.parts
        for projectPath in _iterFolder(
            self.rootPath, self.extensions, self.maxFolderDepth
        ):
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


def existingFolder(path):
    path = pathlib.Path(path).resolve()
    if not path.is_dir():
        raise argparse.ArgumentError("not a directory")
    return path


def main():
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--http-port", default=8000, type=int)
    parser.add_argument("--websocket-port", type=int)
    parser.add_argument("--rcjk-host")
    parser.add_argument("--filesystem-root", type=existingFolder)
    args = parser.parse_args()

    host = args.host
    httpPort = args.http_port
    webSocketPort = (
        args.websocket_port if args.websocket_port is not None else httpPort + 1
    )

    if (args.rcjk_host and args.filesystem_root) or (
        not args.rcjk_host and not args.filesystem_root
    ):
        print("You must specify exactly one of --rcjk-host and --filesystem-root.")
        sys.exit(1)

    if args.filesystem_root:
        manager = FileSystemProjectManager(args.filesystem_root)
    else:
        manager = RCJKProjectManager(args.rcjk_host)

    fontraRoot = pathlib.Path(__file__).resolve().parent.parent.parent.parent
    contentFolder = fontraRoot / "client"
    templatesFolder = fontraRoot / "templates"

    server = FontraServer(
        host,
        httpPort,
        webSocketPort,
        contentFolder,
        templatesFolder,
        projectManager=manager,
    )
    server.setup()
    server.run()


if __name__ == "__main__":
    main()
