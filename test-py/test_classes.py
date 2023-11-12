import json
import pathlib
from dataclasses import asdict

from fontra.backends.fontra import deserializeGlyph
from fontra.core.classes import VariableGlyph, classCastFuncs, serializableClassSchema

repoRoot = pathlib.Path(__file__).resolve().parent.parent
jsonPath = repoRoot / "src" / "fontra" / "client" / "core" / "classes.json"


def test_classes_json():
    with open(jsonPath) as f:
        classesFromJSON = json.load(f)

    assert (
        serializableClassSchema() == classesFromJSON
    ), "classes.json is stale, please run ./scripts/rebuild_classes_json.sh"


def test_cast():
    glyphPath = (
        repoRoot
        / "test-common"
        / "fonts"
        / "MutatorSans.fontra"
        / "glyphs"
        / "B^1.json"
    )
    originalGlyph = deserializeGlyph(glyphPath.read_text(encoding="utf-8"))
    unstructuredGlyph = asdict(originalGlyph)
    glyph = classCastFuncs[VariableGlyph](unstructuredGlyph)
    assert glyph == originalGlyph
