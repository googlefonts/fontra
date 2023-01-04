from copy import deepcopy
import json
import pathlib
import pytest
from fontra.core.changes import (
    addPathToPattern,
    applyChange,
    collectChangePaths,
    filterChangePattern,
    matchChangePattern,
    removePathFromPattern,
)


applyChangeTestDataPath = (
    pathlib.Path(__file__).parent.parent / "test-common" / "apply-change-test-data.json"
)

matchChangePatternTestDataPath = (
    pathlib.Path(__file__).parent.parent / "test-common" / "match-change-pattern-test-data.json"
)

applyChangeTestData = json.loads(applyChangeTestDataPath.read_text(encoding="utf-8"))
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
    addPathToPattern(pattern, path)
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
    json.loads(matchChangePatternTestDataPath.read_text(encoding="utf-8")),
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
            None,
        ),
        (
            {"p": ["A"], "f": "*"},
            {"A": None, "B": None},
            None,
        ),
        (
            {"p": ["A"], "f": "*", "c": [{}]},
            {"A": None},
            None,
        ),
        (
            {"p": ["A"], "f": "*"},
            {"A": {"B": None}},
            {"p": ["A"], "f": "*"},
        ),
        (
            {"p": ["A", "B"], "f": "*"},
            {"A": None},
            None,
        ),
        (
            {"p": ["A", "B"], "f": "*"},
            {"A": {"B": None}},
            None,
        ),
        (
            {"p": ["A"], "f": "*"},
            {"B": None},
            {"p": ["A"], "f": "*"},
        ),
        (
            {"c": [{"p": ["A"], "f": "*"}], "f": "!"},
            {"A": None},
            {"f": "!"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}], "f": "!"},
            {"A": {"B": None}},
            {"p": ["A"], "f": "!"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}], "f": "!"},
            {"A": {"C": None}},
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}], "f": "!"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"]}]},
            {"B": {"B": None}},
            {"p": ["A"], "c": [{"p": ["B"]}]},
        ),
        (
            {"c": [{"p": ["A"], "f": "*"}, {"p": ["B"], "f": "!"}]},
            {"A": None},
            {"p": ["B"], "f": "!"},
        ),
        (
            {"c": [{"p": ["A"], "f": "*"}, {"p": ["B"], "f": "!"}]},
            {"B": None},
            {"p": ["A"], "f": "*"},
        ),
        (
            {"c": [{"p": ["A"], "f": "*"}, {"p": ["B"], "f": "!"}]},
            {"C": None},
            {"c": [{"p": ["A"], "f": "*"}, {"p": ["B"], "f": "!"}]},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
            {"A": {"B": None}},
            {"p": ["A", "C"], "f": "!"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
            {"A": {"C": None}},
            {"p": ["A", "B"], "f": "*"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
            {"A": {"D": None}},
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
        ),
        (
            {
                "p": ["A"],
                "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}],
                "f": "*",
            },
            {"A": {"B": None, "C": None}},
            {"p": ["A"], "f": "*"},
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "f": "*"}, {"p": ["C"], "f": "!"}]},
            {"A": {"B": None, "C": None}},
            None,
        ),
    ],
)
def test_filterChangePattern_inverse(change, pattern, expectedResult):
    result = filterChangePattern(change, pattern, inverse=True)
    assert expectedResult == result


@pytest.mark.parametrize(
    "change, depth, expectedPaths",
    [
        (
            {},
            2,
            [],
        ),
        (
            {"p": ["A"]},
            1,
            [("A",)],
        ),
        (
            {"p": ["A"]},
            2,
            [],
        ),
        (
            {"p": ["A", "B"]},
            2,
            [("A", "B")],
        ),
        (
            {"c": [{"p": ["A"]}, {"p": ["B"]}]},
            1,
            [("A",), ("B",)],
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"]}, {"p": ["C"]}]},
            2,
            [("A", "B"), ("A", "C")],
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "c": [{"p": ["D"]}]}, {"p": ["C"]}]},
            2,
            [("A", "B"), ("A", "C")],
        ),
        (
            {"p": ["A"], "c": [{"p": ["B"], "c": [{"p": ["D"]}]}, {"p": ["C"]}]},
            3,
            [("A", "B", "D")],
        ),
    ],
)
def test_collectChangePaths(change, depth, expectedPaths):
    paths = collectChangePaths(change, depth)
    assert expectedPaths == paths
