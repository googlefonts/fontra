from copy import deepcopy
import json
import pathlib
import pytest
from fontra.core.changes import applyChange


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
