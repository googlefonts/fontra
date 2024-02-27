import os
import pathlib


def directoryTreeToList(path):
    path = pathlib.Path(path).resolve()
    prefixLength = len(os.fspath(path))

    paths = sorted(_allPaths(path))
    lines = []

    for path in paths:
        lines.append(os.fspath(path)[prefixLength:])
        if not path.is_dir():
            for line in path.read_text().splitlines():
                lines.append(line)

    return lines


ignore = {".DS_Store"}


def _allPaths(path):
    for childPath in path.iterdir():
        if childPath.name in ignore:
            continue
        if childPath.is_dir():
            yield from _allPaths(childPath)
        else:
            yield childPath
