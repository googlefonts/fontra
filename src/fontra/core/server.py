import asyncio
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from functools import partial
from importlib import resources
from importlib.metadata import entry_points
import logging
import mimetypes
from urllib.parse import quote
from aiohttp import web
from .remote import RemoteObjectServer


logger = logging.getLogger(__name__)


@dataclass(kw_only=True)
class FontraServer:

    host: str
    httpPort: int
    webSocketPort: int
    webSocketProxyPort: int
    projectManager: object
    cookieMaxAge: int = 7 * 24 * 60 * 60
    allowedFileExtensions: set = frozenset(["css", "html", "ico", "js", "svg", "woff2"])

    def setup(self):
        self.startupTime = datetime.now(timezone.utc).replace(microsecond=0)
        self.httpApp = web.Application()
        self.viewEntryPoints = {
            ep.name: ep.value for ep in entry_points(group="fontra.views")
        }
        if hasattr(self.projectManager, "setupWebRoutes"):
            self.projectManager.setupWebRoutes(self)
        routes = []
        routes.append(web.get("/", self.rootDocumentHandler))
        for viewName, viewPackage in self.viewEntryPoints.items():
            routes.append(
                web.get(
                    f"/{viewName}/-/{{path:.*}}",
                    partial(self.viewPathHandler, viewName),
                )
            )
            routes.append(web.get(f"/{viewName}/{{path:.*}}", partial(self.staticContentHandler, packageName=viewPackage)))
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

    async def staticContentHandler(self, request, packageName="fontra.client"):
        ifModSince = request.if_modified_since
        if ifModSince is not None and ifModSince >= self.startupTime:
            return web.HTTPNotModified()

        pathItems = [""] + request.match_info["path"].split("/")
        modulePath = packageName + ".".join(pathItems[:-1])
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
        response = await self.projectManager.projectPageHandler(request)
        response.set_cookie("websocket-port", str(self.webSocketProxyPort))
        response.set_cookie("fontra-version-token", str(self.startupTime))
        return response

    async def viewPathHandler(self, viewName, request):
        authToken = await self.projectManager.authorize(request)
        if not authToken:
            qs = quote(request.path_qs, safe="")
            response = web.HTTPFound(f"/?ref={qs}")
            return response

        path = request.match_info["path"]
        if not await self.projectManager.projectAvailable(authToken, path):
            return web.HTTPNotFound()

        try:
            html = resources.read_text(
                self.viewEntryPoints[viewName], f"{viewName}.html"
            )
        except (FileNotFoundError, ModuleNotFoundError):
            return web.HTTPNotFound()

        response = web.Response(text=html, content_type="text/html")
        response.set_cookie("websocket-port", str(self.webSocketProxyPort))
        response.set_cookie("fontra-version-token", str(self.startupTime))
        return response


@asynccontextmanager
async def ensureClose(closable):
    try:
        yield
    finally:
        await closable.close()
