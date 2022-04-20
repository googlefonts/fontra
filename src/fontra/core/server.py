import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from importlib import resources
import logging
import mimetypes
from urllib.parse import quote, parse_qs
from aiohttp import web
from .remote import RemoteObjectServer


logger = logging.getLogger(__name__)


@dataclass
class AuthorizedSession:
    username: str
    token: str
    remoteIP: str


@dataclass(kw_only=True)
class FontraServer:

    host: str
    httpPort: int
    webSocketPort: int
    webSocketProxyPort: int
    projectManager: object
    cookieMaxAge: int = 7 * 24 * 60 * 60
    allowedFileExtensions: set = frozenset(["css", "ico", "js", "svg", "woff2"])

    def setup(self):
        self.startupTime = datetime.now(timezone.utc).replace(microsecond=0)
        self.authorizedSessions = {}
        self.httpApp = web.Application()
        routes = []
        routes.append(web.get("/", self.rootDocumentHandler))
        routes.append(web.post("/login", self.loginHandler))
        routes.append(web.post("/logout", self.logoutHandler))
        routes.append(web.get("/editor/-/{path:.*}", self.projectsPathHandler))
        routes.append(web.get("/{path:.*}", self.staticContentHandler))
        self.httpApp.add_routes(routes)
        self.httpApp.on_startup.append(self.startRemoteObjectServer)

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

    async def startRemoteObjectServer(self, app):
        server = RemoteObjectServer(
            self.projectManager,
            verboseErrors=True,
        )

        async def runner():
            serverTask = server.getServerTask(host=self.host, port=self.webSocketPort)
            async with ensureClose(self.projectManager), serverTask:
                await asyncio.Future()

        self._websocketTask = asyncio.create_task(runner())

    async def staticContentHandler(self, request):
        ifModSince = request.if_modified_since
        if ifModSince is not None and ifModSince >= self.startupTime:
            return web.HTTPNotModified()

        pathItems = [""] + request.match_info["path"].split("/")
        modulePath = "fontra.client" + ".".join(pathItems[:-1])
        resourceName = pathItems[-1]
        try:
            data = resources.read_binary(modulePath, resourceName)
        except (FileNotFoundError, IsADirectoryError, ModuleNotFoundError):
            return web.HTTPNotFound()
        ext = resourceName.rsplit(".", 1)[-1].lower()
        if ext not in self.allowedFileExtensions:
            return web.HTTPNotFound()
        contentType, _ = mimetypes.guess_type(resourceName)
        response = web.Response(body=data, content_type=contentType)
        response.last_modified = self.startupTime
        return response

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

        html = resources.read_text("fontra.client", "landing.html")
        response = web.Response(text=html, content_type="text/html")
        response.set_cookie(
            "fontra-require-login",
            "true" if self.projectManager.requireLogin else "false",
        )
        if session is not None:
            response.set_cookie(
                "fontra-authorization-token", session.token, max_age=self.cookieMaxAge
            )
        else:
            response.del_cookie("fontra-authorization-token")
        response.set_cookie("websocket-port", str(self.webSocketPort))
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

        destination = request.query.get("ref", "/")
        response = web.HTTPFound(destination)
        response.set_cookie("fontra-username", username, max_age=self.cookieMaxAge)
        if token is not None:
            response.set_cookie(
                "fontra-authorization-token", token, max_age=self.cookieMaxAge
            )
            response.del_cookie("fontra-authorization-failed")
        else:
            response.set_cookie("fontra-authorization-failed", "true", max_age=5)
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
                qs = quote(request.path_qs, safe="")
                response = web.HTTPFound(f"/?ref={qs}")
                return response

        path = request.match_info["path"]
        if not await self.projectManager.projectAvailable(authToken, path):
            return web.HTTPNotFound()

        html = resources.read_text("fontra.client.editor", "editor.html")
        response = web.Response(text=html, content_type="text/html")
        response.set_cookie("websocket-port", str(self.webSocketPort))
        return response


@asynccontextmanager
async def ensureClose(closable):
    try:
        yield
    finally:
        await closable.close()
