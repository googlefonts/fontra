import operator

import pytest

from fontra.core.classes import structure, unstructure
from fontra.core.path import (
    Contour,
    InterpolationError,
    PackedPath,
    PackedPathPointPen,
    Path,
)

pathTestData = [
    {
        "contourInfo": [{"endPoint": 3, "isClosed": True}],
        "coordinates": [60, 0, 110, 0, 110, 120, 60, 120],
        "pointTypes": [0, 0, 0, 0],
    },
    {
        "coordinates": [
            232,
            -10,
            338,
            -10,
            403,
            38,
            403,
            182,
            403,
            700,
            363,
            700,
            363,
            182,
            363,
            60,
            313,
            26,
            232,
            26,
            151,
            26,
            100,
            60,
            100,
            182,
            100,
            280,
            60,
            280,
            60,
            182,
            60,
            38,
            124,
            -10,
        ],
        "pointTypes": [
            8,
            2,
            2,
            8,
            0,
            0,
            8,
            2,
            2,
            8,
            2,
            2,
            8,
            0,
            0,
            8,
            2,
            2,
        ],
        "contourInfo": [{"endPoint": 17, "isClosed": True}],
    },
    {
        "coordinates": [
            338,
            -10,
            403,
            38,
            403,
            182,
            403,
            700,
            232,
            -10,
        ],
        "pointTypes": [
            2,
            2,
            8,
            0,
            8,
        ],
        "contourInfo": [{"endPoint": 4, "isClosed": True}],
    },
    {
        "coordinates": [
            232,
            -10,
            338,
            -10,
            403,
            38,
            403,
            182,
            403,
            700,
        ],
        "pointTypes": [
            8,
            2,
            2,
            8,
            0,
        ],
        "contourInfo": [{"endPoint": 4, "isClosed": False}],
    },
]


@pytest.mark.parametrize("path", pathTestData)
def test_packedPathPointPenRoundTrip(path):
    path = structure(path, PackedPath)
    pen = PackedPathPointPen()
    path.drawPoints(pen)
    repackedPath = pen.getPath()
    assert path == repackedPath
    assert unstructure(path) == unstructure(repackedPath)


@pytest.mark.parametrize("path", pathTestData)
def test_unpackPathRoundTrip(path):
    path = structure(path, PackedPath)
    unpackedPath = path.unpackedContours()
    repackedPath = PackedPath.fromUnpackedContours(unpackedPath)
    assert path == repackedPath
    assert unstructure(path) == unstructure(repackedPath)


@pytest.mark.parametrize("path", pathTestData)
def test_pathConversion(path):
    packedPath = structure(path, PackedPath)
    path = packedPath.asPath()
    packedPath2 = path.asPackedPath()
    assert packedPath == packedPath2


expectedPackedPathRepr = "PackedPath(coordinates=[232, -10, 338, -10, 403, 38, 403, 182, \
403, 700, 363, 700, 363, 182, 363, 60, 313, 26, 232, 26, 151, 26, 100, 60, 100, 182, \
100, 280, 60, 280, 60, 182, 60, 38, 124, -10], pointTypes=[<PointType.ON_CURVE_SMOOTH: \
8>, <PointType.OFF_CURVE_CUBIC: 2>, <PointType.OFF_CURVE_CUBIC: 2>, \
<PointType.ON_CURVE_SMOOTH: 8>, <PointType.ON_CURVE: 0>, <PointType.ON_CURVE: 0>, \
<PointType.ON_CURVE_SMOOTH: 8>, <PointType.OFF_CURVE_CUBIC: 2>, \
<PointType.OFF_CURVE_CUBIC: 2>, <PointType.ON_CURVE_SMOOTH: 8>, \
<PointType.OFF_CURVE_CUBIC: 2>, <PointType.OFF_CURVE_CUBIC: 2>, \
<PointType.ON_CURVE_SMOOTH: 8>, <PointType.ON_CURVE: 0>, <PointType.ON_CURVE: 0>, \
<PointType.ON_CURVE_SMOOTH: 8>, <PointType.OFF_CURVE_CUBIC: 2>, \
<PointType.OFF_CURVE_CUBIC: 2>], contourInfo=[ContourInfo(endPoint=17, isClosed=True)], \
pointAttributes=None)"


def test_packedPathRepr():
    path = pathTestData[1]
    packedPath = structure(path, PackedPath)
    assert expectedPackedPathRepr == str(packedPath)


expectedPathRepr = "Path(contours=[Contour(points=[{'x': 232, 'y': -10, 'smooth': True}, \
{'x': 338, 'y': -10, 'type': 'cubic'}, {'x': 403, 'y': 38, 'type': 'cubic'}, {'x': 403, \
'y': 182, 'smooth': True}, {'x': 403, 'y': 700}, {'x': 363, 'y': 700}, {'x': 363, 'y': \
182, 'smooth': True}, {'x': 363, 'y': 60, 'type': 'cubic'}, {'x': 313, 'y': 26, 'type': \
'cubic'}, {'x': 232, 'y': 26, 'smooth': True}, {'x': 151, 'y': 26, 'type': 'cubic'}, \
{'x': 100, 'y': 60, 'type': 'cubic'}, {'x': 100, 'y': 182, 'smooth': True}, {'x': 100, \
'y': 280}, {'x': 60, 'y': 280}, {'x': 60, 'y': 182, 'smooth': True}, {'x': 60, 'y': 38, \
'type': 'cubic'}, {'x': 124, 'y': -10, 'type': 'cubic'}], isClosed=True)])"


def test_pathRepr():
    path = pathTestData[1]
    packedPath = structure(path, PackedPath)
    path = packedPath.asPath()
    assert expectedPathRepr == str(path)


pathMathPath1 = Path(
    contours=[
        Contour(
            points=[
                {"x": 60, "y": 0},
                {"x": 110, "y": 0, "attrs": {"test": 321}},
                {"x": 110, "y": 120},
                {"x": 60, "y": 120},
            ],
            isClosed=True,
        )
    ]
)
pathMathPath2 = Path(
    contours=[
        Contour(
            points=[
                {"x": 30, "y": 2},
                {"x": 10, "y": 5},
                {"x": 20, "y": -20},
                {"x": -10, "y": -4},
            ],
            isClosed=True,
        )
    ]
)
pathMathPathIncompatible = Path(
    contours=[
        Contour(
            points=[
                {"x": 30, "y": 2},
                {"x": 10, "y": 5},
                {"x": 20, "y": -20},
            ],
            isClosed=True,
        )
    ]
)
pathMathPathAdd = Path(
    contours=[
        Contour(
            points=[
                {"x": 90, "y": 2},
                {"x": 120, "y": 5, "attrs": {"test": 321}},
                {"x": 130, "y": 100},
                {"x": 50, "y": 116},
            ],
            isClosed=True,
        )
    ]
)
pathMathPathSub = Path(
    contours=[
        Contour(
            points=[
                {"x": 30, "y": -2},
                {"x": 100, "y": -5, "attrs": {"test": 321}},
                {"x": 90, "y": 140},
                {"x": 70, "y": 124},
            ],
            isClosed=True,
        )
    ]
)
pathMathPathMul = Path(
    contours=[
        Contour(
            points=[
                {"x": 120, "y": 0},
                {"x": 220, "y": 0, "attrs": {"test": 321}},
                {"x": 220, "y": 240},
                {"x": 120, "y": 240},
            ],
            isClosed=True,
        )
    ]
)


@pytest.mark.parametrize(
    "path, arg, expectedResult, op, exception",
    [
        (pathMathPath1, pathMathPath2, pathMathPathAdd, operator.add, None),
        (pathMathPath1, pathMathPath2, pathMathPathSub, operator.sub, None),
        (pathMathPath1, 2, pathMathPathMul, operator.mul, None),
        (
            pathMathPath1,
            pathMathPathIncompatible,
            None,
            operator.add,
            InterpolationError,
        ),
        (
            pathMathPath1,
            pathMathPathIncompatible,
            None,
            operator.sub,
            InterpolationError,
        ),
    ],
)
def test_pathMath(path, arg, expectedResult, op, exception):
    path = path.asPackedPath()
    if isinstance(arg, Path):
        arg = arg.asPackedPath()

    if exception is None:
        result = op(path, arg)
        result = result.asPath()
        assert expectedResult == result
    else:
        with pytest.raises(exception):
            _ = op(path, arg)
