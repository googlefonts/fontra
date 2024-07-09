from dataclasses import replace

from fontTools.varLib.models import piecewiseLinearMap

from .classes import DiscreteFontAxis, FontAxis


def mapAxesFromUserSpaceToSourceSpace(
    axes: list[FontAxis | DiscreteFontAxis],
) -> list[FontAxis | DiscreteFontAxis]:
    return [
        mapAxisFromUserSpaceToSourceSpace(axis) if axis.mapping else axis
        for axis in axes
    ]


def mapAxisFromUserSpaceToSourceSpace(
    axis: FontAxis | DiscreteFontAxis,
) -> FontAxis | DiscreteFontAxis:
    mapping = {a: b for a, b in axis.mapping}
    replacedFields: dict = {"valueLabels": [], "mapping": []}
    valueFields = ["defaultValue"]

    if isinstance(axis, FontAxis):
        valueFields.append("minValue")
        valueFields.append("maxValue")
    else:
        replacedFields["values"] = [piecewiseLinearMap(v, mapping) for v in axis.values]

    for name in valueFields:
        replacedFields[name] = piecewiseLinearMap(getattr(axis, name), mapping)

    return replace(axis, **replacedFields)


def locationToTuple(loc: dict[str, float]) -> tuple[tuple[str, float], ...]:
    return tuple(sorted(loc.items()))


def makeSparseNormalizedLocation(location: dict[str, float]) -> dict[str, float]:
    # location must be normalized
    return {name: value for name, value in location.items() if value}


def makeSparseLocation(location, defaultLocation):
    return {
        name: location[name]
        for name, value in defaultLocation.items()
        if location.get(name, value) != value
    }


def makeDenseLocation(location, defaultLocation):
    return {name: location.get(name, value) for name, value in defaultLocation.items()}
