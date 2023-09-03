import logging
import pathlib
from importlib.metadata import entry_points

logger = logging.getLogger(__name__)


def getFileSystemBackend(path):
    return _getFileSystemBackend(path, False)


def newFileSystemBackend(path):
    return _getFileSystemBackend(path, True)


def _getFileSystemBackend(path, create):
    logVerb = "creating" if create else "loading"

    path = pathlib.Path(path)

    if not create and not path.exists():
        raise FileNotFoundError(path)

    logger.info(f"{logVerb} project {path.name}...")
    fileType = path.suffix.lstrip(".").lower()
    backendEntryPoints = entry_points(group="fontra.filesystem.backends")
    entryPoint = backendEntryPoints[fileType]
    backendClass = entryPoint.load()

    if create:
        if not hasattr(backendClass, "createFromPath"):
            raise ValueError(f"Creating a new .{fileType} is not supported")
        backend = backendClass.createFromPath(path)
    else:
        backend = backendClass.fromPath(path)

    logger.info(f"done {logVerb} {path.name}")
    return backend
