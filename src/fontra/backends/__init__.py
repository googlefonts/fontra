import logging
import pathlib
from importlib.metadata import entry_points

logger = logging.getLogger(__name__)


def getFileSystemBackend(path):
    path = pathlib.Path(path)
    if not path.exists():
        raise FileNotFoundError(path)
    logger.info(f"loading project {path.name}...")
    fileType = path.suffix.lstrip(".").lower()
    backendEntryPoints = entry_points(group="fontra.filesystem.backends")
    entryPoint = backendEntryPoints[fileType]
    backendClass = entryPoint.load()

    backend = backendClass.fromPath(path)
    logger.info(f"done loading {path.name}")
    return backend
