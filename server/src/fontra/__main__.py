import argparse
from dataclasses import dataclass
import logging
import pathlib
from urllib.parse import urlsplit, urlunsplit, parse_qs
import secrets
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
class AuthorizedSession:
    username: str
    token: str
    remoteIP: str


@dataclass
class FontraServer:

    host: str
    httpPort: int
    webSocketPort: int
    contentFolder: str
    templatesFolder: str
    projectManager: object

    def setup(self):
        self.authorizedSessions = {}
        self.httpApp = web.Application()
        routes = []
        routes.append(web.get("/", self.rootDocumentHandler))
        routes.append(web.post("/login", self.loginHandler))
        routes.append(web.post("/logout", self.logoutHandler))
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

    async def rootDocumentHandler(self, request):
        username = request.cookies.get("fontra-username")
        authToken = request.cookies.get("fontra-authorization-token")
        session = self.authorizedSessions.get(authToken)
        if session is not None and (
            session.username != username or session.remoteIP != request.remote
        ):
            session = None

        templatePath = self.templatesFolder / "landing.html"
        html = templatePath.read_text(encoding="utf-8")
        html = html.format(webSocketPort=self.webSocketPort)
        response = web.Response(text=html, content_type="text/html")
        if session is not None:
            response.set_cookie("fontra-authorization-token", session.token)
        else:
            response.del_cookie("fontra-authorization-token")
        return response

    async def loginHandler(self, request):
        formContent = parse_qs(await request.text())
        username = formContent["username"][0]
        password = formContent["password"][0]
        # if username + password ok: token = ...
        if password == "a":
            token = secrets.token_hex(32)
            self.authorizedSessions[token] = AuthorizedSession(
                username, token, request.remote
            )
        else:
            token = None

        response = web.HTTPFound("/")
        response.set_cookie("fontra-username", username)
        if token is not None:
            response.set_cookie("fontra-authorization-token", token)
            response.del_cookie("fontra-authorization-failed")
        else:
            response.set_cookie("fontra-authorization-failed", "true")
            response.del_cookie("fontra-authorization-token")
        return response

    async def logoutHandler(self, request):
        authToken = request.cookies.get("fontra-authorization-token")
        if authToken is not None and authToken in self.authorizedSessions:
            session = self.authorizedSessions[authToken]
            logging.info(f"logging out '{session.username}'")
            del self.authorizedSessions[authToken]
        response = web.HTTPFound("/")
        return response

    async def projectsPathHandler(self, request):
        authToken = request.cookies.get("fontra-authorization-token")
        if authToken not in self.authorizedSessions:
            response = web.HTTPFound("/")
            return response

        pathItems = []
        for i in range(10):
            k = f"path{i}"
            item = request.match_info.get(k)
            if item is None:
                break
            pathItems.append(item)

        if not self.projectManager.projectExists(*pathItems):
            return web.HTTPNotFound()

        projectPath = "/".join(pathItems)

        editorTemplatePath = self.templatesFolder / "editor.html"
        editorHTML = editorTemplatePath.read_text(encoding="utf-8")
        editorHTML = editorHTML.format(
            webSocketPort=self.webSocketPort, projectPath=projectPath
        )
        return web.Response(text=editorHTML, content_type="text/html")


class FileSystemProjectManager:

    remoteMethodNames = {"getProjectList"}
    requireLogin = False

    def __init__(self, rootPath, maxFolderDepth=3):
        self.rootPath = rootPath
        self.maxFolderDepth = maxFolderDepth
        self.extensions = {".designspace", ".ufo", ".rcjk"}
        self.fontHandlers = {}
        self.clients = {}
        self.authorizationToken = None

    def projectExists(self, *pathItems):
        projectPath = self.rootPath.joinpath(*pathItems)
        return projectPath.exists()

    def authorizeToken(self, token):
        self.authorizationToken = token
        return True

    async def getRemoteSubject(self, path):
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
            fontHandler = FontHandler(backend, self.clients, self.authorizeToken)
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
