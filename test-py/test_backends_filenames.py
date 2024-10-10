import pathlib

import pytest

from fontra.backends.filenames import fileNameToString, stringToFileName


@pytest.mark.parametrize(
    "string,fileName",
    [
        ("Aring", "Aring^1"),
        ("aring", "aring"),
        ("ABCDEGF", "ABCDEGF^V3"),
        ("f_i", "f_i"),
        ("F_I", "F_I^5"),
        (".notdef", "%2Enotdef"),
        (".null", "%2Enull"),
        ("CON", "CON^7"),
        ("con", "con^0"),
        ("aux", "aux^0"),
        ("con.alt", "con%2Ealt"),
        ("conalt", "conalt"),
        ("con.bbb.alt", "con%2Ebbb.alt"),
        ("nul.alt", "nul%2Ealt"),
        ("aux.alt", "aux%2Ealt"),
        ("com1.alt", "com1%2Ealt"),
        ("a:", "a%3A"),
        ("A:", "A%3A^1"),
        ("a/", "a%2F"),
        ("A/", "A%2F^1"),
        ("A^321", "A%5E321^1"),
        ("a\\", "a%5C"),
        ("a\t", "a%09"),
        # ("a ",          "a%20"),  # escape space?
        ("a ", "a "),  # or not?
        ('a"', "a%22"),
        ("aaaaaaaaaA", "aaaaaaaaaA^0G"),
        ("AAAAAAAAAA", "AAAAAAAAAA^VV"),
        ("Åå", "Åå^1"),
        ("😻", "😻"),
    ],
)
def test_stringToFileName(string, fileName, tmpdir):
    tmpdir = pathlib.Path(tmpdir)
    assert fileName == stringToFileName(string)
    assert string == fileNameToString(fileName)
    path = tmpdir / (fileName + ".test")
    path.write_bytes(b"")
    resultingPath, *_ = list(tmpdir.glob("*.test"))
    assert string == fileNameToString(resultingPath.stem)
