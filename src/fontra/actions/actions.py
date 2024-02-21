from dataclasses import dataclass, replace
from functools import cached_property
from typing import Any

from fontTools.misc.transform import Transform

from ..core.classes import GlobalAxis, GlobalDiscreteAxis, VariableGlyph
from ..core.protocols import ReadableFontBackend

_actions = {}


def registerActionClass(name):
    def wrapper(cls):
        assert name not in _actions
        cls.actionName = name
        _actions[name] = cls
        return cls

    return wrapper


def getActionClass(name):
    return _actions[name]


def getAction(name, input, arguments):
    cls = getActionClass(name)
    action = cls(input=input, arguments=arguments)
    assert isinstance(action, ReadableFontBackend)
    return action


@dataclass(kw_only=True)
class BaseAction:
    input: ReadableFontBackend
    arguments: dict

    def close(self) -> None:
        ...

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        glyph = await self.input.getGlyph(glyphName)
        return await self.processGlyph(glyph)

    async def getGlobalAxes(self) -> list[GlobalAxis | GlobalDiscreteAxis]:
        axes = await self.input.getGlobalAxes()
        return await self.processGlobalAxes(axes)

    async def getGlyphMap(self) -> dict[str, list[int]]:
        glyphMap = await self.input.getGlyphMap()
        return await self.processGlyphMap(glyphMap)

    async def getCustomData(self) -> dict[str, Any]:
        customData = await self.input.getCustomData()
        return await self.processCustomData(customData)

    async def getUnitsPerEm(self) -> int:
        unitsPerEm = await self.input.getUnitsPerEm()
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
class ScaleAction(BaseAction):
    @cached_property
    def _transformation(self):
        return Transform().scale(self.arguments["scaleFactor"])

    async def processGlyph(self, glyph):
        return replace(
            glyph,
            layers={
                layerName: replace(layer, glyph=self._scaleGlyph(layer.glyph))
                for layerName, layer in glyph.layers.items()
            },
        )

    def _scaleGlyph(self, glyph):
        return replace(
            glyph,
            path=glyph.path.transformed(self._transformation),
            components=[
                self._scaleComponentOrigin(component) for component in glyph.components
            ],
        )

    def _scaleComponentOrigin(self, component):
        x, y = self._transformation.transformPoint(
            (component.transformation.translateX, component.transformation.translateY)
        )
        return replace(
            component,
            transformation=replace(
                component.transformation, translateX=x, translateY=y
            ),
        )
