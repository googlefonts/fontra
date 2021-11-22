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
    path = pathlib.Path(args.font)
    assert path.exists()
    if path.suffix == ".rcjk":
        backend = RCJKBackend(path)
    else:
        assert False, path

    async def setupWebsocketServer(app):
        server = Server(backend, {"getGlyph", "getGlyphNames"})
        await server.getServerTask(port=8001)

    httpApp = web.Application()
    httpApp.add_routes([web.static('/', "client")])
    httpApp.on_startup.append(setupWebsocketServer)
    web.run_app(httpApp, port=8000)


if __name__ == "__main__":
    main()
