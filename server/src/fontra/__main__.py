import argparse
import logging
import pathlib
import sys
from .server import FontraServer
from .projectmanager_fs import FileSystemProjectManager
from .projectmanager_rcjk import RCJKProjectManager


def existingFolder(path):
    path = pathlib.Path(path).resolve()
    if not path.is_dir():
        raise argparse.ArgumentError("not a directory")
    return path


def main():
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--http-port", default=8000, type=int)
    parser.add_argument("--websocket-port", type=int)
    parser.add_argument("--rcjk-host")
    parser.add_argument("--filesystem-root", type=existingFolder)
    parser.add_argument(
        "--force-login",
        action="store_true",
        help="Enforce login, even for a project manager that doesn't need it. "
        "For testing login.",
    )
    args = parser.parse_args()

    host = args.host
    httpPort = args.http_port
    webSocketPort = (
        args.websocket_port if args.websocket_port is not None else httpPort + 1
    )

    if (args.rcjk_host and args.filesystem_root) or (
        not args.rcjk_host and not args.filesystem_root
    ):
        print("You must specify exactly one of --rcjk-host and --filesystem-root.")
        sys.exit(1)

    if args.filesystem_root:
        manager = FileSystemProjectManager(args.filesystem_root)
    else:
        manager = RCJKProjectManager(args.rcjk_host)

    if args.force_login:
        manager.requireLogin = True

    fontraRoot = pathlib.Path(__file__).resolve().parent.parent.parent.parent
    contentFolder = fontraRoot / "client"
    templatesFolder = fontraRoot / "templates"

    server = FontraServer(
        host,
        httpPort,
        webSocketPort,
        contentFolder,
        templatesFolder,
        projectManager=manager,
    )
    server.setup()
    server.run()


if __name__ == "__main__":
    main()
