import argparse
from dataclasses import dataclass
import logging
import pathlib
from urllib.parse import urlsplit, urlunsplit
import sys
from aiohttp import web
from .backends import getBackendClass
from .fonthandler import FontHandler
from .ws_server import WebSocketServer


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


@dataclass
class FontraServer:

    host: str
    httpPort: int
    webSocketPort: int
    contentFolder: str
    templatesFolder: str
    projectManager: object

    def setup(self):
        self.httpApp = web.Application()
        routes = []
        routes.append(web.get("/", self.rootDocumentHandler))
        maxDepth = 4
        for i in range(maxDepth):
            path = "/".join(f"{{path{j}}}" for j in range(i + 1))
            routes.append(web.get("/projects/" + path, self.projectsPathHandler))
        routes.append(web.static("/", self.contentFolder))
        self.httpApp.add_routes(routes)
        self.httpApp.on_startup.append(self.setupWebSocketServer)

    def run(self):
        host = self.host
        httpPort = self.httpPort
        pad = " " * (22 - len(str(httpPort)) - len(host))
        print("+---------------------------------------------------+")
        print("|                                                   |")
        print("|      Fontra!                                      |")
        print("|                                                   |")
        print("|      Navigate to:                                 |")
        print(f"|      http://{host}:{httpPort}/{pad}              |")
        print("|                                                   |")
        print("+---------------------------------------------------+")
        web.run_app(self.httpApp, host=host, port=httpPort)

    async def setupWebSocketServer(self, app):
        server = WebSocketServer(
            self.projectManager.getRemoteSubject,
            clients=self.projectManager.clients,
            verboseErrors=True,
        )
        await server.getServerTask(host=self.host, port=self.webSocketPort)

    async def projectsPathHandler(self, request):
        pathItems = []
        for i in range(10):
            k = f"path{i}"
            item = request.match_info.get(k)
            if item is None:
                break
            pathItems.append(item)
        return web.Response(text=f"Hallo {'/'.join(pathItems)}")

    # async def rootDocumentHandler(self, request):
    #     editorTemplatePath = self.templatesFolder / "editor.html"
    #     editorHTML = editorTemplatePath.read_text(encoding="utf-8")
    #     editorHTML = editorHTML.format(webSocketPort=self.webSocketPort)
    #     return web.Response(text=editorHTML, content_type="text/html")

    async def rootDocumentHandler(self, request):
        templatePath = self.templatesFolder / "landing.html"
        html = templatePath.read_text(encoding="utf-8")
        html = html.format(webSocketPort=self.webSocketPort)
        return web.Response(text=html, content_type="text/html")


class FileSystemProjectManager:

    needsLogin = False
    remoteMethodNames = {"getProjectList", "getRequireLogin"}

    def __init__(self, rootPath, maxFolderDepth=3):
        self.rootPath = pathlib.Path(rootPath).resolve()
        self.maxFolderDepth = maxFolderDepth
        self.extensions = {".designspace", ".ufo", ".rcjk"}
        self.fontHandlers = {}
        self.clients = {}

    async def getRequireLogin(self, *, client):
        return False

    async def getRemoteSubject(self, path):
        if path == "/":
            # login stuff
            return self
        pathItems = tuple(path.split("/"))
        assert all(item for item in pathItems)
        assert pathItems[0] == "projects"
        pathItems = pathItems[1:]
        print("-----", pathItems)
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
        for projectPath in _iterFolder(self.rootPath, self.extensions, self.maxFolderDepth):
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


def main():
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--http-port", default=8000, type=int)
    parser.add_argument("--websocket-port", type=int)
    parser.add_argument("--rcjk-host")
    parser.add_argument("--filesystem-root")
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
