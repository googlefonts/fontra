from dataclasses import dataclass
import logging
from urllib.parse import parse_qs
from aiohttp import web
from .websocket import WebSocketServer


logger = logging.getLogger(__name__)


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
        routes.append(web.get("/test/{tail:.*}", self.notFoundHandler))
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
            connections=self.projectManager.connections,
            verboseErrors=True,
        )
        await server.getServerTask(host=self.host, port=self.webSocketPort)

    async def notFoundHandler(self, request):
        return web.HTTPNotFound()

    async def rootDocumentHandler(self, request):
        session = None
        if self.projectManager.requireLogin:
            username = request.cookies.get("fontra-username")
            authToken = request.cookies.get("fontra-authorization-token")
            session = self.authorizedSessions.get(authToken)
            if session is not None and (
                session.username != username or session.remoteIP != request.remote
            ):
                session = None

        html = self._formatHTMLTemplate(
            "landing.html",
            webSocketPort=self.webSocketPort,
            requireLogin=str(bool(self.projectManager.requireLogin)).lower(),
        )
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
        token = await self.projectManager.login(username, password)
        if token is not None:
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
            logger.info(f"logging out '{session.username}'")
            del self.authorizedSessions[authToken]
        response = web.HTTPFound("/")
        return response

    async def projectsPathHandler(self, request):
        authToken = None
        if self.projectManager.requireLogin:
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

        if not self.projectManager.projectExists(authToken, *pathItems):
            return web.HTTPNotFound()

        projectPath = "/".join(pathItems)

        html = self._formatHTMLTemplate(
            "editor.html",
            webSocketPort=self.webSocketPort,
            projectPath=projectPath,
        )
        return web.Response(text=html, content_type="text/html")

    def _formatHTMLTemplate(self, fileName, **kwargs):
        templatePath = self.templatesFolder / fileName
        html = templatePath.read_text(encoding="utf-8")
        return html.format(**kwargs)
