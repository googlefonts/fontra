import pytest
from fontTools.misc.vector import Vector

from fontra.core.classes import DiscreteFontAxis, FontAxis
from fontra.core.discretevariationmodel import DiscreteVariationModel, ErrorDescription

testAxes = [
    FontAxis(
        name="Weight",
        tag="wght",
        label="Weight",
        minValue=400,
        defaultValue=400,
        maxValue=700,
    ),
    DiscreteFontAxis(
        name="Italic", tag="ital", label="Italic", values=[0, 1], defaultValue=0
    ),
]

testLocations = [
    {},
    {"Weight": 700},
    {"Italic": 1},
    {"Weight": 700, "Italic": 1},
]

testSourceData = [
    [0, 0],
    [100, 0],
    [0, 100, 200],  # Incompatible Italic sources
    [100, 100, 300],  # etc.
]


testCases = [
    ({}, [0, 0]),
    ({"Weight": 550}, [50, 0]),
    ({"Weight": 700}, [100, 0]),
    ({"Italic": 1}, [0, 100, 200]),
    ({"Weight": 700, "Italic": 1}, [100, 100, 300]),
    ({"Weight": 550, "Italic": 1}, [50, 100, 250]),
    ({"Weight": 550, "Italic": 0.4}, [50, 0]),
    ({"Weight": 550, "Italic": 0.6}, [50, 100, 250]),
]


@pytest.mark.parametrize("location, expectedResult", testCases)
def test_discreteVariationModel(location, expectedResult):
    assert len(testSourceData) == len(testLocations)
    model = DiscreteVariationModel(testLocations, testAxes)
    deltas = model.getDeltas([Vector(s) for s in testSourceData])
    result = model.interpolateFromDeltas(location, deltas)
    assert result.instance == expectedResult
    assert result.errors is None


testBadLocations = list(testLocations)
testBadLocations[3] = {}

testCasesBadLocations = [
    (
        {},
        [0, 0],
        [
            ErrorDescription(
                message="Italic=0: Locations must be unique.",
                type="model-error",
            ),
        ],
    ),
    (
        {"Weight": 600},
        [100, 0],
        [
            ErrorDescription(
                message="Italic=0: Locations must be unique.",
                type="model-error",
            ),
        ],
    ),
]


@pytest.mark.parametrize(
    "location, expectedResult, expectedErrors", testCasesBadLocations
)
def test_discreteVariationModel_bad_locations(location, expectedResult, expectedErrors):
    model = DiscreteVariationModel(testBadLocations, testAxes)
    deltas = model.getDeltas([Vector(s) for s in testSourceData])
    result = model.interpolateFromDeltas(location, deltas)
    assert result.instance == expectedResult
    assert result.errors == expectedErrors


testIncompatibleSourceData = [
    [0, 0],
    [100, 0, 1, 1],  # bad incompatible source
    [0, 100, 200],
    [100, 100, 300],
]

testCasesIncompatibleSources = [
    (
        {},
        [0, 0],
        [
            ErrorDescription(
                message="",
                type="interpolation-error",
            ),
        ],
    ),
    (
        {"Weight": 600},
        [100, 0, 1, 1],
        [
            ErrorDescription(
                message="",
                type="interpolation-error",
            ),
        ],
    ),
]


@pytest.mark.parametrize(
    "location, expectedResult, expectedErrors", testCasesIncompatibleSources
)
def test_discreteVariationModel_incompatible_sources(
    location, expectedResult, expectedErrors
):
    model = DiscreteVariationModel(testLocations, testAxes)
    deltas = model.getDeltas([Vector(s) for s in testIncompatibleSourceData])
    result = model.interpolateFromDeltas(location, deltas)
    assert result.instance == expectedResult
    assert result.errors == expectedErrors
