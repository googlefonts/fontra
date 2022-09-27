from .changes import baseChangeFunctions


glyphChangeFunctions = {
    "=xy": lambda path, pointIndex, x, y: path.setPointPosition(pointIndex, x, y),
    "insertContour": lambda path, contourIndex, contour: path.insertContour(
        contourIndex, contour
    ),
    "deleteContour": lambda path, contourIndex: path.deleteContour(contourIndex),
    "deletePoint": lambda path, contourIndex, contourPointIndex: path.deletePoint(
        contourIndex, contourPointIndex
    ),
    "insertPoint": lambda path, contourIndex, contourPointIndex, point: path.insertPoint(
        contourIndex, contourPointIndex, point
    ),
}

glyphChangeFunctions.update(baseChangeFunctions)
