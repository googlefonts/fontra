import json
import pathlib

import pytest

from fontra.core.changes import applyChange
from fontra.core.path import PackedPath

testDataPath = (
    pathlib.Path(__file__).parent.parent / "test-common" / "path-change-test-data.json"
)

pathChangeTestData = json.loads(testDataPath.read_text(encoding="utf-8"))
pathChangeTestInputData = pathChangeTestData["inputPaths"]


pathChangeTestData = [
    (
        testCase["testName"],
        testCase["inputPathName"],
        testCase["change"],
        PackedPath.fromUnpackedContours(testCase["expectedPath"]),
    )
    for testCase in pathChangeTestData["tests"]
]


@pytest.mark.parametrize(
    "testName, inputPathName, change, expectedData", pathChangeTestData
)
def test_applyChange(testName, inputPathName, change, expectedData):
    subject = PackedPath.fromUnpackedContours(pathChangeTestInputData[inputPathName])
    applyChange(subject, change)
    assert subject == expectedData
