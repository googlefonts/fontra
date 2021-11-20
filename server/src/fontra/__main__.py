import argparse
import logging
import pathlib
from .backends.rcjk import RCJKBackend
from .font import FontServer
from .server import Server


def main():
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("font")
    args = parser.parse_args()
    path = pathlib.Path(args.font)
    assert path.exists()
    if path.suffix == ".rcjk":
        server = Server(RCJKBackend(path), {"getGlyph", "getGlyphNames"})
        server.run()


if __name__ == "__main__":
    main()
