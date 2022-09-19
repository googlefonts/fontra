from .changes import baseChangeFunctions
from .packedpath import deleteContour, insertContour


def setPointPosition(path, pointIndex, x, y):
    coords = path["coordinates"]
    i = pointIndex * 2
    coords[i] = x
    coords[i + 1] = y


glyphChangeFunctions = {
    "=xy": setPointPosition,
    "insertContour": insertContour,
    "deleteContour": deleteContour,
}


glyphChangeFunctions.update(baseChangeFunctions)
