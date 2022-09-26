from .changes import baseChangeFunctions
from .packedpath import deleteContour, insertContour, deletePoint


def setPointPosition(path, pointIndex, x, y):
    coords = path["coordinates"]
    i = pointIndex * 2
    coords[i] = x
    coords[i + 1] = y


glyphChangeFunctions = {
    "=xy": setPointPosition,
    "insertContour": insertContour,
    "deleteContour": deleteContour,
    "deletePoint": deletePoint,
}


glyphChangeFunctions.update(baseChangeFunctions)
