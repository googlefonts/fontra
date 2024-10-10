# String to file name algorithm, originally proposed for UFO glyph file names.
# See also https://github.com/unified-font-object/ufo-spec/issues/164

from urllib.parse import unquote

separatorChar = "^"

# TODO: [insert references]
reservedCharacters = set(' " % * + / : < > ? [ \\ ] | '.split())
reservedCharacters.update(chr(i) for i in range(32))
# reservedCharacters.add(" ")  # should we escape space chars or not?
reservedCharacters.add(chr(0x7F))
reservedCharacters.add(separatorChar)
assert all(len(c) == 1 for c in reservedCharacters)


# TODO: [insert references]
reservedFileNames = set(
    """
CON
PRN
AUX
CLOCK$
NUL
COM1
LPT1
LPT2
LPT3
COM2
COM3
COM4
""".lower().split()
)


base32chars = "0123456789ABCDEFGHIJKLMNOPQRSTUV"
assert len(set(base32chars)) == 32


def stringToFileName(string: str) -> str:
    codeDigits = []
    for i in range(0, len(string), 5):
        digit = 0
        bit = 1
        for c in string[i : i + 5]:
            if c.isupper():
                digit |= bit
            bit <<= 1
        codeDigits.append(digit)
    # strip trailing zeros
    while codeDigits and codeDigits[-1] == 0:
        codeDigits.pop()
    fileName = "".join(
        f"%{ord(c):02X}" if c in reservedCharacters else c for c in string
    )
    if fileName[0] == ".":
        fileName = "%2E" + fileName[1:]
    elif "." in fileName:
        base, rest = fileName.split(".", 1)
        if base.lower() in reservedFileNames:
            fileName = base + "%2E" + rest
    if not codeDigits and fileName.lower() in reservedFileNames:
        codeDigits = [0]
    if codeDigits:
        disambiguationCode = separatorChar + "".join(base32chars[d] for d in codeDigits)
    else:
        disambiguationCode = ""
    return fileName + disambiguationCode


def fileNameToString(fileName: str) -> str:
    string = fileName.split(separatorChar, 1)[0]
    return unquote(string, encoding="ascii", errors="strict")
