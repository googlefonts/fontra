import argparse
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

    async def handleWebSocketPort(request):
        return web.Response(text=str(websocketPort))

    async def setupWebSocketServer(app):
        clients = {}
        backend = await backendCoro
        font = FontHandler(backend, clients)
        server = WebSocketServer(
            font,
            font.remoteMethodNames,
            clients=clients,
            verboseErrors=True,
        )
        await server.getServerTask(host=host, port=websocketPort)

    async def rootHandler(request):
        return web.HTTPFound("/index.html")

    httpApp = web.Application()
    httpApp.add_routes(
        [
            web.get("/websocketport", handleWebSocketPort),
            web.get("/", rootHandler),
            web.static("/", "client"),
        ]
    )
    httpApp.on_startup.append(setupWebSocketServer)
    pad = " " * (22 - len(str(httpPort)) - len(host))
    print("+---------------------------------------------------+")
    print("|                                                   |")
    print("|      Fontra!                                      |")
    print("|                                                   |")
    print("|      Navigate to:                                 |")
    print(f"|      http://{host}:{httpPort}/{pad}              |")
    print("|                                                   |")
    print("+---------------------------------------------------+")
    web.run_app(httpApp, host=host, port=httpPort)


if __name__ == "__main__":
    main()
