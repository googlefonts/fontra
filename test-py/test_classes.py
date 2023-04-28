import json
import pathlib

from fontra.core.classes import serializableClassSchema

repoRoot = pathlib.Path(__file__).resolve().parent.parent
jsonPath = repoRoot / "src" / "fontra" / "client" / "core" / "classes.json"


def test_classes_json():
    with open(jsonPath) as f:
        classesFromJSON = json.load(f)

    assert serializableClassSchema() == classesFromJSON, "classes.json is stale"
