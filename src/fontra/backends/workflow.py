from dataclasses import dataclass, field
from typing import Any

import yaml

from ..core.classes import GlobalAxis, GlobalDiscreteAxis, GlobalSource, VariableGlyph
from ..core.protocols import ReadableFontBackend
from ..workflow.workflow import Workflow


@dataclass(kw_only=True)
class WorkflowBackend:
    workflow: Workflow
    context: Any = None
    endPoint: ReadableFontBackend | None = field(init=False, default=None)

    @classmethod
    def fromPath(cls, path):
        config = yaml.safe_load(path.read_text())
        return cls(workflow=Workflow(config=config, parentDir=path.parent))

    async def _ensureSetup(self) -> ReadableFontBackend:
        if self.endPoint is None:
            self.context = self.workflow.endPoints()
            endPoints = await self.context.__aenter__()
            self.endPoint = endPoints.endPoint
            assert self.endPoint is not None
        return self.endPoint

    async def aclose(self) -> None:
        await self.context.__aexit__(None, None, None)

    async def getGlyph(self, glyphName: str) -> VariableGlyph | None:
        endPoint = await self._ensureSetup()
        return await endPoint.getGlyph(glyphName)

    async def getGlobalAxes(self) -> list[GlobalAxis | GlobalDiscreteAxis]:
        endPoint = await self._ensureSetup()
        return await endPoint.getGlobalAxes()

    async def getSources(self) -> dict[str, GlobalSource]:
        endPoint = await self._ensureSetup()
        return await endPoint.getSources()

    async def getGlyphMap(self) -> dict[str, list[int]]:
        endPoint = await self._ensureSetup()
        return await endPoint.getGlyphMap()

    async def getCustomData(self) -> dict[str, Any]:
        endPoint = await self._ensureSetup()
        return await endPoint.getCustomData()

    async def getUnitsPerEm(self) -> int:
        endPoint = await self._ensureSetup()
        return await endPoint.getUnitsPerEm()
