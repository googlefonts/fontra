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


def mapAxisFromUserSpaceToSourceSpace(axis: FontAxis | DiscreteFontAxis):
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


def locationToTuple(loc):
    return tuple(sorted(loc.items()))


def makeSparseNormalizedLocation(location):
    # location must be normalized
    return {name: value for name, value in location.items() if value}
