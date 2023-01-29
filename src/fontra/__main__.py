import argparse
from importlib.metadata import entry_points
import logging
import secrets
from .core.server import FontraServer
from . import __version__ as fontraVersion


def main():
    logging.basicConfig(
        format="%(asctime)s %(name)-17s %(levelname)-8s %(message)s",
        level=logging.INFO,
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--http-port", default=8000, type=int)
    parser.add_argument(
        "--launch", action="store_true", help="Launch the default browser"
    )
    parser.add_argument(
        "-V",
        "--version",
        action="version",
        version=fontraVersion,
        help="Show Fontra's version number and exit",
    )

    subParsers = parser.add_subparsers(required=True)
    for entryPoint in entry_points(group="fontra.projectmanagers"):
        if entryPoint.name in subParsers.choices:
            # Avoid adding a sub-parser multiple times
            # See https://github.com/googlefonts/fontra/issues/141
            continue
        subParser = subParsers.add_parser(entryPoint.name)
        pmFactory = entryPoint.load()
        pmFactory.addArguments(subParser)
        subParser.set_defaults(getProjectManager=pmFactory.getProjectManager)

    args = parser.parse_args()

    host = args.host
    httpPort = args.http_port
    manager = args.getProjectManager(args)
    server = FontraServer(
        host=host,
        httpPort=httpPort,
        projectManager=manager,
        launchWebBrowser=args.launch,
        versionToken=secrets.token_hex(4),
    )
    server.setup()
    server.run()


if __name__ == "__main__":
    main()
