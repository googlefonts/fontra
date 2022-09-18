from .changes import baseChangeFunctions


def setPointPosition(path, pointIndex, x, y):
    coords = path["coordinates"]
    i = pointIndex * 2
    coords[i] = x
    coords[i + 1] = y


glyphChangeFunctions = {
    "=xy": setPointPosition,
}


glyphChangeFunctions.update(baseChangeFunctions)
