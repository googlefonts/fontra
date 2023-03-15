from importlib.resources import files


def test_fontra_third_party_modules():
    # Make sure the third-party folder exists and isn't empty
    names = list(files("fontra.client.third-party").iterdir())
    assert names
