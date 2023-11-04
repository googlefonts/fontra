import base64
import json
import zlib


def dumpURLFragment(obj):
    text = json.dumps(obj, separators=(",", ":"))
    compressed = zlib.compress(text.encode("utf-8"))
    return "#" + base64.b64encode(compressed).decode("ascii")


def loadURLFragment(fragment):
    assert fragment[0] == "#"
    compressed = base64.b64decode(fragment[1:])
    text = zlib.decompress(compressed).decode("utf-8")
    return json.loads(text)
