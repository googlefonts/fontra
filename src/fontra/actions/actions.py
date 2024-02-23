import pathlib
from contextlib import closing
from dataclasses import dataclass, field, replace
from functools import cached_property
from typing import Any, Protocol, runtime_checkable

from fontTools.misc.transform import Transform

from ..backends import getFileSystemBackend, newFileSystemBackend
from ..backends.copy import copyFont
from ..core.classes import GlobalAxis, GlobalDiscreteAxis, VariableGlyph
from ..core.protocols import ReadableFontBackend


@runtime_checkable
class ConnectableActionProtocol(Protocol):
    async def connect(self, input: ReadableFontBackend) -> None:
        ...


@runtime_checkable
class InputActionProtocol(Protocol):
    async def prepare(self) -> ReadableFontBackend:
        ...


@runtime_checkable
class OutputActionProtocol(Protocol):
    async def process(self) -> None:
        ...


_actions = {}


def registerActionClass(name):
    def wrapper(cls):
        assert name not in _actions
        cls.actionName = name
        _actions[name] = cls
        return cls

    return wrapper


def getActionClass(name):
    cls = _actions.get(name)
    if cls is None:
        raise KeyError(f"No action found named '{name}'")
    return cls


@dataclass(kw_only=True)
class BaseFilterAction:
    input: ReadableFontBackend | None = field(init=False, default=None)

    @cached_property
    def validatedInput(self) -> ReadableFontBackend:
        assert isinstance(self.input, ReadableFontBackend)
        return self.input

    async def connect(self, input: ReadableFontBackend) -> None:
        self.input = input

    def close(self) -> None:
        ...

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        glyph = await self.validatedInput.getGlyph(glyphName)
        return await self.processGlyph(glyph)

    async def getGlobalAxes(self) -> list[GlobalAxis | GlobalDiscreteAxis]:
        axes = await self.validatedInput.getGlobalAxes()
        return await self.processGlobalAxes(axes)

    async def getGlyphMap(self) -> dict[str, list[int]]:
        glyphMap = await self.validatedInput.getGlyphMap()
        return await self.processGlyphMap(glyphMap)

    async def getCustomData(self) -> dict[str, Any]:
        customData = await self.validatedInput.getCustomData()
        return await self.processCustomData(customData)

    async def getUnitsPerEm(self) -> int:
        unitsPerEm = await self.validatedInput.getUnitsPerEm()
        return await self.processUnitsPerEm(unitsPerEm)

    # Default no-op process methods, to be overridden.

    # These methods should *not* modify the objects, but return modified *copies*

    async def processGlyph(self, glyph):
        return glyph

    async def processGlobalAxes(self, axes):
        return axes

    async def processGlyphMap(self, glyphMap):
        return glyphMap

    async def processCustomData(self, customData):
        return customData

    async def processUnitsPerEm(self, unitsPerEm):
        return unitsPerEm


@registerActionClass("scale")
@dataclass(kw_only=True)
class ScaleAction(BaseFilterAction):
    scaleFactor: float
    scaleUnitsPerEm: bool = True

    async def processGlyph(self, glyph):
        transformation = Transform().scale(self.scaleFactor)
        return replace(
            glyph,
            layers={
                layerName: replace(
                    layer, glyph=self._scaleGlyph(layer.glyph, transformation)
                )
                for layerName, layer in glyph.layers.items()
            },
        )

    def _scaleGlyph(self, glyph, transformation):
        xAdvance = (
            glyph.xAdvance * self.scaleFactor if glyph.xAdvance else glyph.xAdvance
        )
        yAdvance = (
            glyph.yAdvance * self.scaleFactor if glyph.yAdvance else glyph.yAdvance
        )
        verticalOrigin = (
            glyph.verticalOrigin * self.scaleFactor
            if glyph.verticalOrigin
            else glyph.verticalOrigin
        )
        # TODO: anchors, guidelines
        return replace(
            glyph,
            xAdvance=xAdvance,
            yAdvance=yAdvance,
            verticalOrigin=verticalOrigin,
            path=glyph.path.transformed(transformation),
            components=[
                self._scaleComponentOrigin(component) for component in glyph.components
            ],
        )

    def _scaleComponentOrigin(self, component):
        scaleFactor = self.scaleFactor
        x = component.transformation.translateX * scaleFactor
        y = component.transformation.translateY * scaleFactor
        return replace(
            component,
            transformation=replace(
                component.transformation, translateX=x, translateY=y
            ),
        )

    async def processUnitsPerEm(self, unitsPerEm):
        if self.scaleUnitsPerEm:
            return unitsPerEm * self.scaleFactor
        else:
            return unitsPerEm


@registerActionClass("subset")
@dataclass(kw_only=True)
class SubsetAction(BaseFilterAction):
    glyphNames: set[str] = field(default_factory=set)
    glyphNamesFile: str | None = None

    def __post_init__(self):
        if self.glyphNamesFile:
            path = pathlib.Path(self.glyphNamesFile)
            assert path.is_file()
            glyphNames = set(path.read_text().split())
            self.glyphNames = self.glyphNames | glyphNames
        self._glyphMap = None

    async def _getSubsettedGlyphMap(self):
        if self._glyphMap is None:
            bigGlyphMap = await self.input.getGlyphMap()
            subsettedGlyphMap = {}
            glyphNames = set(self.glyphNames)
            while glyphNames:
                glyphName = glyphNames.pop()
                if glyphName not in bigGlyphMap:
                    continue

                subsettedGlyphMap[glyphName] = bigGlyphMap[glyphName]

                # TODO: add getGlyphsMadeOf() ReadableFontBackend protocol member,
                # so backends can implement this more efficiently
                glyph = await self.input.getGlyph(glyphName)
                compoNames = {
                    compo.name
                    for layer in glyph.layers.values()
                    for compo in layer.glyph.components
                }
                for compoName in compoNames:
                    if compoName in bigGlyphMap and compoName not in subsettedGlyphMap:
                        glyphNames.add(compoName)

            self._glyphMap = subsettedGlyphMap
        return self._glyphMap

    async def getGlyph(self, glyphName):
        glyphMap = await self._getSubsettedGlyphMap()
        if glyphName not in glyphMap:
            return None
        return await self.input.getGlyph(glyphName)

    async def getGlyphMap(self):
        return await self._getSubsettedGlyphMap()


@registerActionClass("input")
@dataclass(kw_only=True)
class InputAction:
    source: str

    async def prepare(self) -> ReadableFontBackend:
        return getFileSystemBackend(pathlib.Path(self.source).resolve())


@registerActionClass("output")
@dataclass(kw_only=True)
class OutputAction:
    destination: str
    input: ReadableFontBackend | None = field(init=False, default=None)

    @cached_property
    def validatedInput(self) -> ReadableFontBackend:
        assert isinstance(self.input, ReadableFontBackend)
        return self.input

    async def connect(self, input: ReadableFontBackend) -> None:
        self.input = input

    async def process(self) -> None:
        output = newFileSystemBackend(pathlib.Path(self.destination).resolve())

        with closing(output):
            await copyFont(self.validatedInput, output)
