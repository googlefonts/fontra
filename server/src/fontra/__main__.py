import argparse
from dataclasses import dataclass
import logging
import pathlib
from urllib.parse import urlsplit, urlunsplit
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
    websocketPort: int
    httpRoot: str
    backendCoro: object  # TODO: turn into factory function, taking path

    def setup(self):
        indexPath = self.httpRoot / "index.html"
        self.httpApp = web.Application()
        self.httpApp.add_routes(
            [
                web.get("/websocketport", self.handleWebSocketPort),
                web.get("/", self.rootHandler),
                web.static("/", self.httpRoot),
            ]
        )
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
        clients = {}
        backend = await self.backendCoro
        font = FontHandler(backend, clients)
        server = WebSocketServer(
            font,
            font.remoteMethodNames,
            clients=clients,
            verboseErrors=True,
        )
        await server.getServerTask(host=self.host, port=self.websocketPort)

    async def handleWebSocketPort(self, request):
        return web.Response(text=str(self.websocketPort))

    async def rootHandler(self, request):
        indexPath = self.httpRoot / "index.html"
        return web.Response(
            text=indexPath.read_text(encoding="utf-8"), content_type="text/html"
        )


def main():
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--http-port", default=8000, type=int)
    parser.add_argument("--websocket-port", type=int)
    parser.add_argument("font")
    args = parser.parse_args()

    host = args.host
    httpPort = args.http_port
    websocketPort = (
        args.websocket_port if args.websocket_port is not None else httpPort + 1
    )

    if args.font.startswith("http"):
        backendCoro = getMySQLBackend(args.font)
    else:
        backendCoro = getFileSystemBackend(args.font)

    httpRoot = pathlib.Path("client").resolve()

    server = FontraServer(host, httpPort, websocketPort, httpRoot, backendCoro)
    server.setup()
    server.run()


if __name__ == "__main__":
    main()
