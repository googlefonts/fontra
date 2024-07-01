from __future__ import annotations

import itertools
import logging
from dataclasses import dataclass, replace
from typing import Any

from fontTools.misc.roundTools import otRound
from fontTools.misc.transform import Transform

from ...core.classes import Component, GlyphSource, Layer, StaticGlyph, VariableGlyph
from ...core.path import PackedPath
from .base import (
    BaseFilter,
    getActiveSources,
    locationToString,
    registerFilterAction,
    sparseLocation,
    tuplifyLocation,
)

logger = logging.getLogger(__name__)


@registerFilterAction("scale")
@dataclass(kw_only=True)
class Scale(BaseFilter):
    scaleFactor: float
    scaleUnitsPerEm: bool = True

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        transformation = Transform().scale(self.scaleFactor)
        return replace(
            glyph,
            layers={
                layerName: replace(
                    layer, glyph=self._scaleStaticGlyph(layer.glyph, transformation)
                )
                for layerName, layer in glyph.layers.items()
            },
        )

    def _scaleStaticGlyph(
        self, glyph: StaticGlyph, transformation: Transform
    ) -> StaticGlyph:
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
        anchors = [
            replace(a, x=a.x * self.scaleFactor, y=a.y * self.scaleFactor)
            for a in glyph.anchors
        ]
        guidelines = [
            replace(g, x=g.x * self.scaleFactor, y=g.y * self.scaleFactor)
            for g in glyph.guidelines
        ]
        return replace(
            glyph,
            xAdvance=xAdvance,
            yAdvance=yAdvance,
            verticalOrigin=verticalOrigin,
            path=glyph.path.transformed(transformation),
            components=[
                self._scaleComponentOrigin(component) for component in glyph.components
            ],
            anchors=anchors,
            guidelines=guidelines,
        )

    def _scaleComponentOrigin(self, component: Component) -> Component:
        scaleFactor = self.scaleFactor
        x = component.transformation.translateX * scaleFactor
        y = component.transformation.translateY * scaleFactor
        return replace(
            component,
            transformation=replace(
                component.transformation, translateX=x, translateY=y
            ),
        )

    async def processUnitsPerEm(self, unitsPerEm: int) -> int:
        if self.scaleUnitsPerEm:
            return otRound(unitsPerEm * self.scaleFactor)
        else:
            return unitsPerEm


@registerFilterAction("decompose-composites")
@dataclass(kw_only=True)
class DecomposeComposites(BaseFilter):
    onlyVariableComposites: bool = False

    async def getGlyph(self, glyphName: str) -> VariableGlyph:
        instancer = await self.fontInstancer.getGlyphInstancer(glyphName)
        glyph = instancer.glyph
        defaultFontSourceLocation = instancer.defaultFontSourceLocation

        if not instancer.componentTypes or (
            self.onlyVariableComposites and not any(instancer.componentTypes)
        ):
            return glyph

        haveLocations = getFontSourceLocationsFromSources(
            instancer.activeSources, defaultFontSourceLocation
        )

        needLocations = await getFontSourceLocationsFromBaseGlyphs(
            glyph, self.fontInstancer.backend, defaultFontSourceLocation
        )

        needLocations = multiplyLocations(
            haveLocations, needLocations, defaultFontSourceLocation
        )

        locationsToAdd = [
            dict(location) for location in sorted(needLocations - haveLocations)
        ]
        layerNames = [locationToString(location) for location in locationsToAdd]

        newSources = instancer.activeSources + [
            GlyphSource(name=name, location=location, layerName=name)
            for location, name in zip(locationsToAdd, layerNames, strict=True)
        ]
        newLayers = {}

        for source in newSources:
            instance = instancer.instantiate(source.location)

            newLayers[source.layerName] = Layer(
                glyph=replace(
                    instance.glyph,
                    path=await instance.getDecomposedPath(),
                    components=[],
                ),
            )

        return replace(glyph, sources=newSources, layers=newLayers)


async def getFontSourceLocationsFromBaseGlyphs(
    glyph, backend, defaultFontSourceLocation, seenGlyphNames=None
) -> set[tuple]:
    if seenGlyphNames is None:
        seenGlyphNames = set()

    baseGlyphNames = set()
    for source in getActiveSources(glyph.sources):
        for compo in glyph.layers[source.layerName].glyph.components:
            baseGlyphNames.add(compo.name)

    baseGlyphNames -= seenGlyphNames

    baseGlyphs = []
    for name in baseGlyphNames:
        try:
            baseGlyphs.append(await backend.getGlyph(name))
        except Exception as e:
            logger.error(
                f"decompose-composites: glyph {glyph.name} error while "
                f"retrieving base glyph {name}: {e!r}"
            )

    baseGlyphs = [baseGlyph for baseGlyph in baseGlyphs if baseGlyph is not None]

    locations = set()
    for baseGlyph in baseGlyphs:
        locations.update(
            getFontSourceLocationsFromSources(
                getActiveSources(baseGlyph.sources), defaultFontSourceLocation
            )
        )

    seenGlyphNames |= baseGlyphNames

    for baseGlyph in baseGlyphs:
        locations.update(
            await getFontSourceLocationsFromBaseGlyphs(
                baseGlyph, backend, defaultFontSourceLocation, seenGlyphNames
            )
        )

    return locations


def getFontSourceLocationsFromSources(sources, defaultFontSourceLocation) -> set[tuple]:
    return {
        tuplifyLocation(
            defaultFontSourceLocation
            | {
                k: v
                for k, v in source.location.items()
                if k in defaultFontSourceLocation
            }
        )
        for source in sources
    }


def multiplyLocations(
    haveLocationsTuples, needLocationsTuples, defaultFontSourceLocation
) -> set[tuple]:
    haveLocations = [dict(loc) for loc in haveLocationsTuples]
    needLocations = [
        sparseLocation(dict(loc), defaultFontSourceLocation)
        for loc in needLocationsTuples
    ]
    needLocations = [
        haveLoc | needLoc
        for haveLoc, needLoc in itertools.product(haveLocations, needLocations)
    ]
    return {tuplifyLocation(loc) for loc in needLocations}


@registerFilterAction("drop-shapes")
@dataclass(kw_only=True)
class DropShapes(BaseFilter):
    dropPath: bool = True
    dropComponents: bool = True
    dropAnchors: bool = True
    dropGuidelines: bool = True

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        clearedItems: dict[str, Any] = {}
        if self.dropPath:
            clearedItems["path"] = PackedPath()
        if self.dropComponents:
            clearedItems["components"] = []
        if self.dropAnchors:
            clearedItems["anchors"] = []
        if self.dropGuidelines:
            clearedItems["guidelines"] = []

        return replace(
            glyph,
            layers={
                layerName: replace(layer, glyph=replace(layer.glyph, **clearedItems))
                for layerName, layer in glyph.layers.items()
            },
        )


@registerFilterAction("round-coordinates")
@dataclass(kw_only=True)
class RoundCoordinates(BaseFilter):
    roundPathCoordinates: bool = True
    roundComponentOrigins: bool = True
    roundGlyphMetrics: bool = True
    roundAnchors: bool = True

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        roundPathCoordinates = self.roundPathCoordinates
        roundComponentOrigins = self.roundComponentOrigins
        roundGlyphMetrics = self.roundGlyphMetrics
        roundAnchors = self.roundAnchors

        newLayers = {
            layerName: replace(
                layer,
                glyph=roundCoordinates(
                    layer.glyph,
                    roundPathCoordinates,
                    roundComponentOrigins,
                    roundGlyphMetrics,
                    roundAnchors,
                ),
            )
            for layerName, layer in glyph.layers.items()
        }
        return replace(glyph, layers=newLayers)


def roundCoordinates(
    glyph, roundPathCoordinates, roundComponentOrigins, roundGlyphMetrics, roundAnchors
):
    newFields = {}

    if roundPathCoordinates:
        newFields["path"] = glyph.path.rounded()

    if roundComponentOrigins:
        newFields["components"] = [
            replace(
                compo,
                transformation=replace(
                    compo.transformation,
                    translateX=otRound(compo.transformation.translateX),
                    translateY=otRound(compo.transformation.translateY),
                ),
            )
            for compo in glyph.components
        ]

    if roundGlyphMetrics:
        if glyph.xAdvance:
            newFields["xAdvance"] = otRound(glyph.xAdvance)
        if glyph.yAdvance:
            newFields["yAdvance"] = otRound(glyph.yAdvance)
        if glyph.verticalOrigin:
            newFields["verticalOrigin"] = otRound(glyph.verticalOrigin)

    if roundAnchors:
        newFields["anchors"] = [
            replace(anchor, x=otRound(anchor.x), y=otRound(anchor.y))
            for anchor in glyph.anchors
        ]

    return replace(glyph, **newFields)


@registerFilterAction("set-vertical-glyph-metrics")
@dataclass(kw_only=True)
class SetVerticalGlyphMetrics(BaseFilter):
    verticalOrigin: int
    yAdvance: int

    async def processGlyph(self, glyph: VariableGlyph) -> VariableGlyph:
        if not any(
            layer.glyph.yAdvance is None or layer.glyph.verticalOrigin is None
            for layer in glyph.layers.values()
        ):
            return glyph

        newLayers = {
            layerName: replace(
                layer,
                glyph=replace(
                    layer.glyph,
                    verticalOrigin=(
                        self.verticalOrigin
                        if layer.glyph.verticalOrigin is None
                        else layer.glyph.verticalOrigin
                    ),
                    yAdvance=(
                        self.yAdvance
                        if layer.glyph.yAdvance is None
                        else layer.glyph.yAdvance
                    ),
                ),
            )
            for layerName, layer in glyph.layers.items()
        }
        return replace(glyph, layers=newLayers)
