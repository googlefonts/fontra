from __future__ import annotations

import sys
from dataclasses import dataclass, field, is_dataclass
from functools import partial
from typing import Any, Optional, Union, get_args, get_origin, get_type_hints

import dacite
from fontTools.misc.transform import DecomposedTransform

from .packedpath import PackedPath, PointType
from .path import Path

Location = dict[str, float]
CustomData = dict[str, Any]


@dataclass
class Component:
    name: str
    transformation: DecomposedTransform = field(default_factory=DecomposedTransform)
    location: Location = field(default_factory=Location)


@dataclass
class StaticGlyph:
    path: Union[PackedPath, Path] = field(default_factory=PackedPath)
    components: list[Component] = field(default_factory=list)
    xAdvance: Optional[float] = None
    yAdvance: Optional[float] = None
    verticalOrigin: Optional[float] = None


@dataclass
class Source:
    name: str
    layerName: str
    location: Location = field(default_factory=Location)
    inactive: bool = False
    customData: CustomData = field(default_factory=CustomData)


@dataclass
class Layer:
    glyph: StaticGlyph
    customData: CustomData = field(default_factory=CustomData)


@dataclass
class LocalAxis:
    name: str
    minValue: float
    defaultValue: float
    maxValue: float


@dataclass(slots=True)
class VariableGlyph:
    name: str
    axes: list[LocalAxis] = field(default_factory=list)
    sources: list[Source] = field(default_factory=list)
    layers: dict[str, Layer] = field(default_factory=dict)
    customData: CustomData = field(default_factory=CustomData)


@dataclass(kw_only=True)
class GlobalAxis:
    name: str  # this identifies the axis
    label: str  # a user friendly label
    tag: str  # the opentype 4-char tag
    minValue: float
    defaultValue: float
    maxValue: float
    mapping: list[list[float, float]] = field(default_factory=list)
    hidden: bool = False


GlyphSet = dict[str, VariableGlyph]
GlyphMap = dict[str, list[int]]


@dataclass
class Font:
    unitsPerEm: int = 1000
    glyphs: GlyphSet = field(default_factory=GlyphSet)
    glyphMap: GlyphMap = field(default_factory=GlyphMap)
    lib: dict = field(default_factory=dict)
    axes: list[GlobalAxis] = field(default_factory=list)

    def _trackAssignedAttributeNames(self):
        # see fonthandler.py
        self._assignedAttributeNames = set()

    def __setattr__(self, attrName, value):
        if hasattr(self, "_assignedAttributeNames"):
            self._assignedAttributeNames.add(attrName)
        super().__setattr__(attrName, value)


def makeSchema(*classes, schema=None):
    if schema is None:
        schema = {}
    for cls in classes:
        if cls in schema:
            continue
        cls_globals = vars(sys.modules[cls.__module__])
        classFields = {}
        schema[cls] = classFields
        for name, tp in get_type_hints(cls, cls_globals).items():
            fieldDef = dict(type=tp)
            if is_dataclass(tp):
                makeSchema(tp, schema=schema)
            elif tp.__name__ == "Optional":
                [subtype, _] = get_args(tp)
                fieldDef["type"] = subtype
                fieldDef["optional"] = True
                if is_dataclass(subtype):
                    makeSchema(subtype, schema=schema)
            elif tp.__name__ == "list":
                [subtype] = get_args(tp)
                fieldDef["subtype"] = subtype
                if is_dataclass(subtype):
                    makeSchema(subtype, schema=schema)
            elif tp.__name__ == "dict":
                args = get_args(tp)
                if not args:
                    continue
                [keytype, subtype] = args
                assert keytype == str
                fieldDef["subtype"] = subtype
                if is_dataclass(subtype):
                    makeSchema(subtype, schema=schema)
            elif tp.__name__ == "Union":
                tp = get_args(tp)[0]
                fieldDef = dict(type=tp)
                makeSchema(tp, schema=schema)
            classFields[name] = fieldDef
    return schema


atomicTypes = [str, int, float, bool, Any]


def castTypedList(itemClass, config, obj):
    return [dacite.from_dict(itemClass, v, config=config) for v in obj]


def castTypedDict(itemClass, config, obj):
    return {k: dacite.from_dict(itemClass, v, config=config) for k, v in obj.items()}


def makeCastFuncs(schema, config=None):
    castFuncs = {}
    for cls, fields in schema.items():
        castFuncs[cls] = partial(dacite.from_dict, cls, config=config)
        for fieldName, fieldInfo in fields.items():
            fieldType = fieldInfo["type"]
            if fieldType in atomicTypes or fieldType in schema:
                continue
            originType = get_origin(fieldType)
            itemType = get_args(fieldType)[-1]
            if itemType in atomicTypes:
                continue
            if originType == list:
                castFuncs[fieldType] = partial(castTypedList, itemType, config)
            elif originType == dict:
                castFuncs[fieldType] = partial(castTypedDict, itemType, config)
            elif originType == Union:
                # Use the first type from the union
                cls = get_args(fieldType)[0]
                castFuncs[cls] = partial(dacite.from_dict, cls, config=config)
            else:
                raise TypeError(f"unknown origin type: {originType}")
    return castFuncs


def classesToStrings(schema):
    return {
        cls.__name__: {
            fieldName: {
                k: v.__name__ if hasattr(v, "__name__") else v
                for k, v in fieldDef.items()
            }
            for fieldName, fieldDef in classFields.items()
        }
        for cls, classFields in schema.items()
    }


_castConfig = dacite.Config(cast=[PointType])
from_dict = partial(dacite.from_dict, config=_castConfig)
classSchema = makeSchema(Font)
classCastFuncs = makeCastFuncs(classSchema, config=_castConfig)


def serializableClassSchema():
    return classesToStrings(classSchema)


def printSchemaAsJSON():
    import json

    schema = serializableClassSchema()
    print(json.dumps(schema, indent=2))


if __name__ == "__main__":
    printSchemaAsJSON()
