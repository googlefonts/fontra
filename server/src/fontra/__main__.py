import argparse
import logging
import pathlib
from aiohttp import web
from .backends.rcjk import RCJKBackend
from .server import Server


def main():
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("font")
    args = parser.parse_args()

    # TODO: take from args
    httpPort = 8000
    websocketPort = 8001

    path = pathlib.Path(args.font)
    assert path.exists()
    if path.suffix == ".rcjk":
        backend = RCJKBackend(path)
    else:
        assert False, path

    async def handleWebsocketPort(request):
        return web.Response(text=str(websocketPort))

    async def setupWebsocketServer(app):
        server = Server(backend, {"getGlyph", "getGlyphNames"})
        await server.getServerTask(port=websocketPort)

    httpApp = web.Application()
    httpApp.add_routes([
        web.get('/websocketport', handleWebsocketPort),
        web.static('/', "client"),
    ])
    httpApp.on_startup.append(setupWebsocketServer)
    print("+---------------------------------------------------+")
    print("|                                                   |")
    print("|      Fontra!                                      |")
    print("|                                                   |")
    print("|      Navigate to:                                 |")
    print(f"|      http://localhost:{httpPort}/html/fontra.html       |")
    print("|                                                   |")
    print("+---------------------------------------------------+")
    web.run_app(httpApp, port=httpPort)


if __name__ == "__main__":
    main()
