import argparse
import logging
import pathlib
from aiohttp import web
from .backends import getBackendClass
from .server import Server


def main():
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("font")
    args = parser.parse_args()

    # TODO: take from args
    httpPort = 8000
    websocketPort = 8001

    if args.font.startswith("https://"):
        from .backends.rcjkmysql import RCJKMySQLBackend

        backend = RCJKMySQLBackend.fromURL(args.font)
    else:
        path = pathlib.Path(args.font)
        assert path.exists()
        print(f"loading project {path.name}...")
        fileType = path.suffix.lstrip(".")
        backendClass = getBackendClass(fileType)
        backend = backendClass.fromPath(path)

    async def handleWebsocketPort(request):
        return web.Response(text=str(websocketPort))

    async def setupWebsocketServer(app):
        server = Server(backend, {"getGlyph", "getGlyphNames", "getReversedCmap"})
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
