import json
import pathlib

import pytest

from fontra.core.urlfragment import dumpURLFragment, loadURLFragment

testDataPath = (
    pathlib.Path(__file__).parent.parent / "test-common" / "url-fragment-test-data.json"
)

urlFragmentTestData = json.loads(testDataPath.read_text(encoding="utf-8"))


@pytest.mark.parametrize("testCase", urlFragmentTestData)
def test_urlFragment(testCase):
    obj = testCase["object"]
    expectedFragment = testCase["fragment"]

    assert dumpURLFragment(obj) == expectedFragment
    assert loadURLFragment(expectedFragment) == obj
    assert loadURLFragment(dumpURLFragment(obj)) == obj
