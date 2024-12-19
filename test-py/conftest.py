import pytest


def pytest_addoption(parser):
    parser.addoption("--write-expected-data", action="store_true", default=False)


@pytest.fixture(scope="session")
def writeExpectedData(pytestconfig):
    return pytestconfig.getoption("write_expected_data")
