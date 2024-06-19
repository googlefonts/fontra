from __future__ import annotations

import logging
import pathlib
from dataclasses import dataclass, field

from ...core.async_property import async_cached_property
from ...core.classes import OpenTypeFeatures, VariableGlyph
from ..features import LayoutHandling, subsetFeatures
from .base import BaseFilter, getActiveSources, registerFilterAction

logger = logging.getLogger(__name__)


@dataclass(kw_only=True)
class BaseGlyphSubsetter(BaseFilter):
    layoutHandling: str = LayoutHandling.SUBSET

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        glyphMap, _ = await self._subsettedGlyphMapAndFeatures
        if glyphName not in glyphMap:
            return None
        return await self.validatedInput.getGlyph(glyphName)

    async def getFeatures(self) -> OpenTypeFeatures:
        _, features = await self._subsettedGlyphMapAndFeatures
        return features

    async def getGlyphMap(self) -> dict[str, list[int]]:
        glyphMap, _ = await self._subsettedGlyphMapAndFeatures
        return glyphMap

    @async_cached_property
    async def _subsettedGlyphMapAndFeatures(
        self,
    ) -> tuple[dict[str, list[int]], OpenTypeFeatures]:
        inputGlyphMap = await self.inputGlyphMap
        selectedGlyphs = await self._buildSubsettedGlyphSet(inputGlyphMap)

        selectedGlyphs, features = await self._featuresClosure(selectedGlyphs)
        selectedGlyphs = await self._componentsClosure(selectedGlyphs)
        glyphMap = filterGlyphMap(inputGlyphMap, selectedGlyphs)
        return glyphMap, features

    async def _buildSubsettedGlyphSet(
        self, inputGlyphMap: dict[str, list[int]]
    ) -> set[str]:
        # Override
        raise NotImplementedError

    async def _featuresClosure(
        self, selectedGlyphs
    ) -> tuple[set[str], OpenTypeFeatures]:
        features = await self.validatedInput.getFeatures()

        if features.language != "fea" and features.text:
            logger.warning(
                f"{self.actionName}: can't subset features in language={features.language}"
            )
        elif features.text:
            subsettedFeatureText, subsettedGlyphMap = subsetFeatures(
                features.text,
                await self.inputGlyphMap,
                keepGlyphNames=selectedGlyphs,
                layoutHandling=LayoutHandling(self.layoutHandling),
            )
            selectedGlyphs = set(subsettedGlyphMap)
            features = OpenTypeFeatures(text=subsettedFeatureText)

        return selectedGlyphs, features

    async def _componentsClosure(self, glyphNames) -> set[str]:
        glyphsToCheck = set(glyphNames)  # this set will shrink
        glyphNamesExpanded = set(glyphNames)  # this set may grow

        while glyphsToCheck:
            glyphName = glyphsToCheck.pop()

            try:
                glyph = await self.validatedInput.getGlyph(glyphName)
                assert glyph is not None, f"Unexpected missing glyph {glyphName}"
            except Exception as e:
                if glyphName != ".notdef":
                    logger.error(
                        f"{self.actionName}: glyph {glyphName} caused an error: {e!r}"
                    )
                continue

            componentNames = getComponentNames(glyph)
            uncheckedGlyphs = componentNames - glyphNamesExpanded
            glyphNamesExpanded.update(uncheckedGlyphs)
            glyphsToCheck.update(uncheckedGlyphs)

        return glyphNamesExpanded


def getComponentNames(glyph):
    return {
        compo.name
        for layer in glyph.layers.values()
        for compo in layer.glyph.components
    }


def filterGlyphMap(glyphMap, glyphNames):
    return {
        glyphName: codePoints
        for glyphName, codePoints in glyphMap.items()
        if glyphName in glyphNames
    }


@registerFilterAction("drop-unreachable-glyphs")
@dataclass(kw_only=True)
class DropUnreachableGlyphs(BaseGlyphSubsetter):
    keepNotdef: bool = True
    layoutHandling: str = LayoutHandling.CLOSURE

    async def _buildSubsettedGlyphSet(
        self, inputGlyphMap: dict[str, list[int]]
    ) -> set[str]:
        reachableGlyphs = {
            glyphName for glyphName, codePoints in inputGlyphMap.items() if codePoints
        }

        if self.keepNotdef and ".notdef" in inputGlyphMap:
            reachableGlyphs.add(".notdef")

        return reachableGlyphs


@registerFilterAction("subset-glyphs")
@dataclass(kw_only=True)
class SubsetGlyphs(BaseGlyphSubsetter):
    glyphNames: set[str] = field(default_factory=set)
    glyphNamesFile: str | None = None
    dropGlyphNames: set[str] = field(default_factory=set)
    dropGlyphNamesFile: str | None = None

    def __post_init__(self):
        if self.glyphNamesFile:
            path = pathlib.Path(self.glyphNamesFile)
            assert path.is_file()
            glyphNames = set(path.read_text().split())
            self.glyphNames = set(self.glyphNames) | glyphNames
        if self.dropGlyphNamesFile:
            path = pathlib.Path(self.dropGlyphNamesFile)
            assert path.is_file()
            dropGlyphNames = set(path.read_text().split())
            self.dropGlyphNames = set(self.dropGlyphNames) | dropGlyphNames

    async def _buildSubsettedGlyphSet(
        self, inputGlyphMap: dict[str, list[int]]
    ) -> set[str]:
        glyphNames = set(self.glyphNames)
        if not glyphNames and self.dropGlyphNames:
            glyphNames = set(inputGlyphMap)
        if self.dropGlyphNames:
            glyphNames = glyphNames - set(self.dropGlyphNames)

        return glyphNames


@registerFilterAction("subset-by-development-status")
@dataclass(kw_only=True)
class SubsetByDevelopmentStatus(BaseGlyphSubsetter):
    statuses: list[int]
    sourceSelectBehavior: str = (
        "default"  # "any", "all" or "default" (the default source)
    )

    async def _buildSubsettedGlyphSet(
        self, inputGlyphMap: dict[str, list[int]]
    ) -> set[str]:
        statuses = set(self.statuses)
        selectedGlyphs = set()

        for glyphName in inputGlyphMap:
            if self.sourceSelectBehavior == "default":
                try:
                    instancer = await self.fontInstancer.getGlyphInstancer(
                        glyphName, fixComponentLocationCompatibility=False
                    )
                except Exception as e:
                    logger.error(
                        f"{self.actionName}: glyph {glyphName} caused an error: {e!r}"
                    )
                    continue
                sources = [instancer.defaultSource]
                selectFunc = any
            else:
                selectFunc = any if self.sourceSelectBehavior == "any" else all
                glyph = await self.validatedInput.getGlyph(glyphName)
                if glyph is None:
                    continue
                sources = getActiveSources(glyph.sources)

            if selectFunc(
                source.customData.get("fontra.development.status") in statuses
                for source in sources
            ):
                selectedGlyphs.add(glyphName)

        return selectedGlyphs
