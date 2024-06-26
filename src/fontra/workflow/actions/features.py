from __future__ import annotations

import logging
import pathlib
from dataclasses import dataclass, field
from functools import partial
from types import SimpleNamespace

from fontTools.varLib.models import piecewiseLinearMap

from ...core.classes import OpenTypeFeatures
from ..features import mergeFeatures
from ..featurewriter import FeatureWriter, VariableScalar
from .base import BaseFilter, getActiveSources, registerFilterAction, tuplifyLocation

logger = logging.getLogger(__name__)


@registerFilterAction("generate-palt-vpal-feature")
@dataclass(kw_only=True)
class GeneratePaltVpalFeature(BaseFilter):
    languageSystems: list[tuple[str, str]] = field(default_factory=list)

    async def processFeatures(self, features):
        glyphMap = await self.inputGlyphMap

        axes = await self.getAxes()

        horAdjustments, verAdjustments = await self._collectAdjustments(
            glyphMap, axes.axes
        )

        if not horAdjustments and not verAdjustments:
            return features

        axisList = [
            SimpleNamespace(
                axisTag=axis.tag,
                minValue=axis.minValue,
                defaultValue=axis.defaultValue,
                maxValue=axis.maxValue,
            )
            for axis in axes.axes
        ]

        axisTagMapping = {axis.name: axis.tag for axis in axes.axes}

        w = FeatureWriter()
        for script, language in self.languageSystems:
            w.addLanguageSystem(script, language)

        for isHor, adjustments in [
            (True, horAdjustments),
            (False, verAdjustments),
        ]:
            if not adjustments:
                continue
            fea = w.addFeature("palt" if isHor else "vpal")
            for glyphName, glyphAdjustments in adjustments.items():
                if len(glyphAdjustments) == 1:
                    _, placementScalar, advanceScalar = glyphAdjustments[0]
                else:
                    placementScalar = VariableScalar()
                    placementScalar.axes = axisList
                    advanceScalar = VariableScalar()
                    advanceScalar.axes = axisList
                    for location, placementAdjust, advanceAdjust in glyphAdjustments:
                        location = {axisTagMapping[k]: v for k, v in location.items()}
                        locationTuple = tuplifyLocation(location)
                        placementScalar.add_value(locationTuple, placementAdjust)
                        advanceScalar.add_value(locationTuple, advanceAdjust)
                if isHor:
                    fea.addLine(
                        f"pos {glyphName} <{placementScalar} 0 {advanceScalar} 0>"
                    )
                else:
                    fea.addLine(
                        f"pos {glyphName} <0 {placementScalar} 0 {advanceScalar}>"
                    )

        featureText = w.asFea()

        featureText, _ = mergeFeatures(features.text, glyphMap, featureText, glyphMap)
        return OpenTypeFeatures(text=featureText)

    async def _collectAdjustments(self, glyphMap, axes):
        mapLocation = _makeLocationMapFunc(axes)

        horAdjustments = {}
        verAdjustments = {}
        for glyphName in glyphMap:
            try:
                glyph = await self.getGlyph(glyphName)
            except Exception as e:
                logger.error(
                    f"{self.actionName}: glyph {glyphName} caused an error: {e!r}"
                )
                continue

            glyph = await self.getGlyph(glyphName)
            hAdjustments = []
            vAdjustments = []
            for source in getActiveSources(glyph.sources):
                layerGlyph = glyph.layers[source.layerName].glyph
                lsbAnchorPos = None
                rsbAnchorPos = None
                tsbAnchorPos = None
                bsbAnchorPos = None

                for anchor in layerGlyph.anchors:
                    if anchor.name == "LSB":
                        lsbAnchorPos = anchor.x
                    elif anchor.name == "RSB":
                        rsbAnchorPos = anchor.x
                    elif anchor.name == "TSB":
                        tsbAnchorPos = anchor.y
                    elif anchor.name == "BSB":
                        bsbAnchorPos = anchor.y

                if lsbAnchorPos is not None and rsbAnchorPos is not None:
                    placementAdjust = -lsbAnchorPos
                    advanceAdjust = rsbAnchorPos - lsbAnchorPos - layerGlyph.xAdvance
                    location = mapLocation(source.location)
                    hAdjustments.append((location, placementAdjust, advanceAdjust))

                if (
                    tsbAnchorPos is not None
                    and bsbAnchorPos is not None
                    and layerGlyph.yAdvance is not None
                    and layerGlyph.verticalOrigin is not None
                ):
                    placementAdjust = layerGlyph.verticalOrigin - tsbAnchorPos
                    advanceAdjust = tsbAnchorPos - bsbAnchorPos - layerGlyph.yAdvance
                    location = mapLocation(source.location)
                    vAdjustments.append((location, placementAdjust, advanceAdjust))

            if hAdjustments:
                horAdjustments[glyphName] = hAdjustments

            if vAdjustments:
                verAdjustments[glyphName] = vAdjustments

        return horAdjustments, verAdjustments


def _makeLocationMapFunc(axes):
    mapFuncs = {}
    for axis in axes:
        if axis.mapping:
            forwardMap = dict([(a, b) for a, b in axis.mapping])
            userRange = [axis.minValue, axis.defaultValue, axis.maxValue]
            sourceRange = [piecewiseLinearMap(value, forwardMap) for value in userRange]
            backwardMap = list(zip(sourceRange, userRange))
            mapFuncs[axis.name] = partial(
                piecewiseLinearMap,
                mapping=dict(backwardMap),
            )
        else:
            mapFuncs[axis.name] = lambda v: v

    return lambda location: {
        name: mapFuncs[name](value) for name, value in location.items()
    }


@registerFilterAction("add-features")
@dataclass(kw_only=True)
class AddFeatures(BaseFilter):
    featureFile: str

    async def processFeatures(self, features: OpenTypeFeatures) -> OpenTypeFeatures:
        glyphMap = await self.inputGlyphMap
        featureFile = pathlib.Path(self.featureFile)
        featureText = featureFile.read_text(encoding="utf-8")
        featureText, _ = mergeFeatures(features.text, glyphMap, featureText, glyphMap)
        return OpenTypeFeatures(text=featureText)
