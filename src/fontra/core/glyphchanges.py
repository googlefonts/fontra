from .changes import baseChangeFunctions
from .packedpath import (
    deleteContour,
    deletePoint,
    insertContour,
    insertPoint,
    setPointPosition,
)


glyphChangeFunctions = {
    "=xy": setPointPosition,
    "insertContour": insertContour,
    "deleteContour": deleteContour,
    "deletePoint": deletePoint,
    "insertPoint": insertPoint,
}


glyphChangeFunctions.update(baseChangeFunctions)
