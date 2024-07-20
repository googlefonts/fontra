from collections import defaultdict

import unicodedata2


def decompose(codePoint: int) -> list[int]:
    char = chr(codePoint)
    decomposed = unicodedata2.normalize("NFKD", char)
    return [] if decomposed == char else [ord(c) for c in decomposed]


def _makeUsedByTable():
    table = defaultdict(set)

    for _codePoint in range(32, 0x10FFFF):
        c = chr(_codePoint)
        decomposed = unicodedata2.normalize("NFKD", c)
        if decomposed != c:
            for d in decomposed:
                table[ord(d)].add(ord(c))

    return {k: sorted(v) for k, v in table.items()}


_usedByTable = _makeUsedByTable()


def usedBy(codePoint: int) -> list[int]:
    return _usedByTable.get(codePoint, [])
