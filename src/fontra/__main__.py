import argparse
from importlib.metadata import entry_points
import logging
from .core.server import FontraServer


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
    subParsers = parser.add_subparsers(required=True)
    for entryPoint in entry_points(group="fontra.projectmanagers"):
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
    )
    server.setup()
    if args.launch:
        import webbrowser

        webbrowser.open(f"http://{host}:{httpPort}/")
    server.run()


if __name__ == "__main__":
    main()
