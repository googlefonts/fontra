from __future__ import annotations

import logging
import pathlib
from dataclasses import dataclass, field
from functools import partial
from types import SimpleNamespace

from fontTools.varLib.models import piecewiseLinearMap

from ...core.classes import Kerning, OpenTypeFeatures
from ...core.varutils import locationToTuple
from ..features import mergeFeatures
from ..featurewriter import FeatureWriter, VariableScalar
from .base import BaseFilter, getActiveSources, registerFilterAction

logger = logging.getLogger(__name__)


@registerFilterAction("generate-palt-vpal-feature")
@dataclass(kw_only=True)
class GeneratePaltVpalFeature(BaseFilter):
    languageSystems: list[tuple[str, str]] = field(default_factory=list)

    async def processFeatures(self, features):
        glyphMap = await self.inputGlyphMap

        axes = await self.inputAxes

        horAdjustments, verAdjustments = await self._collectAdjustments(
            glyphMap, axes.axes
        )

        if not horAdjustments and not verAdjustments:
            return features

        axisList, axisTagMapping = _makeAxisListAndMapping(axes.axes)

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
                        locationTuple = locationToTuple(location)
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
        fontInstancer = self.fontInstancer
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
                sourceLocation = fontInstancer.getGlyphSourceLocation(source)
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
                    location = mapLocation(sourceLocation)
                    hAdjustments.append((location, placementAdjust, advanceAdjust))

                if (
                    tsbAnchorPos is not None
                    and bsbAnchorPos is not None
                    and layerGlyph.yAdvance is not None
                    and layerGlyph.verticalOrigin is not None
                ):
                    placementAdjust = layerGlyph.verticalOrigin - tsbAnchorPos
                    advanceAdjust = tsbAnchorPos - bsbAnchorPos - layerGlyph.yAdvance
                    location = mapLocation(sourceLocation)
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


def _makeAxisListAndMapping(axes):
    axisList = [
        SimpleNamespace(
            axisTag=axis.tag,
            minValue=axis.minValue,
            defaultValue=axis.defaultValue,
            maxValue=axis.maxValue,
        )
        for axis in axes
    ]

    axisTagMapping = {axis.name: axis.tag for axis in axes}

    return axisList, axisTagMapping


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


vkrnTopPrefix = "kern.top."
vkrnBottomPrefix = "kern.bottom."


def _kernKeySortFunc(item):
    key, _ = item
    return key.startswith(vkrnTopPrefix) or key.startswith(vkrnBottomPrefix)


@registerFilterAction("generate-vkrn-feature")
@dataclass(kw_only=True)
class GenerateVkrnFeature(BaseFilter):
    dropVkrn: bool = True

    async def processFeatures(self, features: OpenTypeFeatures) -> OpenTypeFeatures:
        verticalKerning = (await self.inputKerning).get("vkrn")
        if verticalKerning is None:
            return features

        glyphMap = await self.inputGlyphMap
        axes = await self.inputAxes
        sources = await self.inputSources
        mapLocation = _makeLocationMapFunc(axes.axes)

        axisList, axisTagMapping = _makeAxisListAndMapping(axes.axes)

        locations = [
            locationToTuple(
                {
                    axisTagMapping[k]: v
                    for k, v in mapLocation(sources[sid].location).items()
                }
            )
            for sid in verticalKerning.sourceIdentifiers
        ]

        w = FeatureWriter()

        for groupName, group in sorted(verticalKerning.groups.items()):
            w.addGroup(groupName, group)

        fea = w.addFeature("vkrn")

        for left, rightDict in sorted(
            verticalKerning.values.items(), key=_kernKeySortFunc
        ):
            if left.startswith(vkrnTopPrefix):
                left = "@" + left

            for right, values in sorted(rightDict.items(), key=_kernKeySortFunc):
                if right.startswith(vkrnBottomPrefix):
                    right = "@" + right

                values = [0 if v is None else round(v) for v in values]
                firstValue = values[0]
                if all(v == firstValue for v in values[1:]):
                    if firstValue == 0:
                        continue
                    scalar = firstValue
                else:
                    scalar = VariableScalar()
                    scalar.axes = axisList
                    for loc, v in zip(locations, values, strict=True):
                        scalar.add_value(loc, v)

                fea.addLine(f"pos {left} {right} {scalar}")

        featureText = w.asFea()

        featureText, _ = mergeFeatures(features.text, glyphMap, featureText, glyphMap)

        return OpenTypeFeatures(text=featureText)

    async def getKerning(
        self,
    ) -> dict[str, Kerning]:
        kerning = await self.inputKerning
        return (
            kerning
            if not self.dropVkrn
            else {
                kernType: kernTable
                for kernType, kernTable in kerning.items()
                if kernType != "vkrn"
            }
        )
