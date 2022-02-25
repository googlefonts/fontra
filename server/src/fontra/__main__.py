import argparse
import logging
import pathlib
from urllib.parse import urlsplit, urlunsplit
from aiohttp import web
from .backends import getBackendClass
from .fonthandler import FontHandler
from .server import Server


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
    parser.add_argument("font")
    args = parser.parse_args()

    # TODO: take from args
    httpPort = 8000
    websocketPort = 8001

    if args.font.startswith("http"):
        backendCoro = getMySQLBackend(args.font)
    else:
        backendCoro = getFileSystemBackend(args.font)

    async def handleWebsocketPort(request):
        return web.Response(text=str(websocketPort))

    async def setupWebsocketServer(app):
        backend = await backendCoro
        font = FontHandler(backend)
        server = Server(
            font,
            font.remoteMethodNames,
            verboseErrors=True,
        )
        await server.getServerTask(host="localhost", port=websocketPort)

    async def rootHandler(request):
        return web.HTTPFound("/index.html")

    httpApp = web.Application()
    httpApp.add_routes(
        [
            web.get("/websocketport", handleWebsocketPort),
            web.get("/", rootHandler),
            web.static("/", "client"),
        ]
    )
    httpApp.on_startup.append(setupWebsocketServer)
    pad = " " * (5 - len(str(httpPort)))
    print("+---------------------------------------------------+")
    print("|                                                   |")
    print("|      Fontra!                                      |")
    print("|                                                   |")
    print("|      Navigate to:                                 |")
    print(f"|      http://localhost:{httpPort}/{pad}                      |")
    print("|                                                   |")
    print("+---------------------------------------------------+")
    web.run_app(httpApp, host="localhost", port=httpPort)


if __name__ == "__main__":
    main()
