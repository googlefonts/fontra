import json
import pathlib

import cattrs

from fontra.backends.fontra import deserializeGlyph
from fontra.core.classes import (
    Layer,
    Source,
    VariableGlyph,
    classCastFuncs,
    serializableClassSchema,
)

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
    unstructuredGlyph = cattrs.unstructure(originalGlyph)
    # Ensure that the PointType enums get converted to ints
    unstructuredGlyph = json.loads(json.dumps(unstructuredGlyph))
    glyph = classCastFuncs[VariableGlyph](unstructuredGlyph)
    assert glyph == originalGlyph
    assert str(glyph) == str(originalGlyph)

    sourcesList = cattrs.unstructure(glyph.sources)
    sources = classCastFuncs[list[Source]](sourcesList)
    assert glyph.sources == sources

    layersDict = cattrs.unstructure(glyph.layers)
    layers = classCastFuncs[dict[str, Layer]](layersDict)
    assert glyph.layers == layers
