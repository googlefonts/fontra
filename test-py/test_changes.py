from copy import deepcopy
import json
import pathlib
import pytest
from fontra.core.changes import (
    addPathToPattern,
    applyChange,
    filterChangePattern,
    matchChangePattern,
    removePathFromPattern,
)


testDataPath = (
    pathlib.Path(__file__).parent.parent / "test-common" / "apply-change-test-data.json"
)

applyChangeTestData = json.loads(testDataPath.read_text(encoding="utf-8"))
applyChangeTestInputData = applyChangeTestData["inputData"]


applyChangeTestData = [
    (
        testCase["testName"],
        testCase["inputDataName"],
        testCase["change"],
        testCase["expectedData"],
    )
    for testCase in applyChangeTestData["tests"]
]


@pytest.mark.parametrize(
    "testName, inputDataName, change, expectedData", applyChangeTestData
)
def test_applyChange(testName, inputDataName, change, expectedData):
    subject = deepcopy(applyChangeTestInputData[inputDataName])
    applyChange(subject, change)
    assert subject == expectedData


@pytest.mark.parametrize(
    "pattern, path, expectedPattern",
    [
        ({}, ["A"], {"A": None}),
        ({}, ["A", "B"], {"A": {"B": None}}),
        ({"A": None}, ["A"], {"A": None}),
        ({"A": None}, ["A", "B"], {"A": None}),
        ({"A": None}, ["B", "C"], {"A": None, "B": {"C": None}}),
        ({"A": {"B": None}}, ["A"], {"A": {"B": None}}),
    ],
)
def test_addPathToPattern(pattern, path, expectedPattern):
    pattern = deepcopy(pattern)
    addPathToPattern (pattern, path)
    assert expectedPattern == pattern


@pytest.mark.parametrize(
    "pattern, path, expectedPattern",
    [
        ({"A": None}, ["A"], {}),
        ({"A": {"B": None}}, ["A", "B"], {}),
        ({"A": None}, ["A", "B"], {"A": None}),
        ({"A": None, "B": {"C": None}}, ["B", "C"], {"A": None}),
        ({"A": {"B": None}}, ["A"], {"A": {"B": None}}),
    ],
)
def test_removePathFromPattern(pattern, path, expectedPattern):
    pattern = deepcopy(pattern)
    removePathFromPattern(pattern, path)
    assert expectedPattern == pattern


@pytest.mark.parametrize(
    "change, pattern, expectedResult",
    [
        ({}, {}, False),
        ({"p": ["A"]}, {"A": None}, True),
        ({"p": ["A"]}, {"A": {"B": None}}, False),
        ({"p": ["A", "B"]}, {"A": None}, True),
        ({"p": ["A", "B"]}, {"A": {"B": None}}, True),
        ({"p": ["A"]}, {"B": None}, False),
        ({"c": [{"p": ["A"]}]}, {"A": None}, True),
        ({"p": ["A"], "c": [{"p": ["B"]}]}, {"A": {"B": None}}, True),
        ({"p": ["A"], "c": [{"p": ["B"]}]}, {"A": {"C": None}}, False),
        ({"p": ["A"], "c": [{"p": ["B"]}]}, {"B": {"B": None}}, False),
    ],
)
def test_matchChangePattern(change, pattern, expectedResult):
    result = matchChangePattern(change, pattern)
    assert expectedResult == result


@pytest.mark.parametrize(
    "change, pattern, expectedResult",
    [
        (
            {},
            {},
            None,
        ),
        (
            {"p": ["A"], "f": "*"},
            {"A": None},
            {"p": ["A"], "f": "*"},
        ),
        (
            {"p": ["A"], "f": "*"},
            {"A": None, "B": None},
            {"p": ["A"], "f": "*"},
        ),
        (
            {"p": ["A"], "f": "*", "c": [{}]},
            {"A": None},
            {"p": ["A"], "f": "*", "c": [{}]},
        ),
        (
            {"p": ["A"], "f": "*"},
            {"A": {"B": None}},
            None,
        ),
        (
            {"p": ["A", "B"], "f": "*"},
            {"A": None},
            {"p": ["A", "B"], "f": "*"},
        ),
        (
            {"p": ["A", "B"], "f": "*"},
            {"A": {"B": None}},
            {"p": ["A", "B"], "f": "*"},
        ),
        (
            {"p": ["A"], "f": "*"},
            {"B": None},
            None,
        ),
        (
            {"c": [{"p": ["A"], "f": "*"}], "f": "!"},
            {"A": None},
            {"p": ["A"], "f": "*"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}]},
            {"A": {"B": None}},
            {"p": ["A", "B"], "f": "*"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"]}]},
            {"A": {"C": None}},
            None,
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"]}]},
            {"B": {"B": None}},
            None,
        ),
        (
            {"c": [{"p": ["A"], "f": "*"}, {"p": ["B"], "f": "!"}]},
            {"A": None},
            {"p": ["A"], "f": "*"},
        ),
        (
            {"c": [{"p": ["A"], "f": "*"}, {"p": ["B"], "f": "!"}]},
            {"B": None},
            {"p": ["B"], "f": "!"},
        ),
        (
            {"c": [{"p": ["A"], "f": "*"}, {"p": ["B"], "f": "!"}]},
            {"C": None},
            None,
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
            {"A": {"B": None}},
            {"p": ["A", "B"], "f": "*"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
            {"A": {"C": None}},
            {"p": ["A", "C"], "f": "!"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
            {"A": {"D": None}},
            None,
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
            {"A": {"B": None, "C": None}},
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
        ),
    ],
)
def test_filterChangePattern(change, pattern, expectedResult):
    result = filterChangePattern(change, pattern)
    assert expectedResult == result
