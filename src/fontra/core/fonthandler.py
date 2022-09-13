from contextlib import contextmanager
import asyncio
from collections import defaultdict
import functools
import logging
from .changes import applyChange, baseChangeFunctions


logger = logging.getLogger(__name__)


def remoteMethod(method):
    method.fontraRemoteMethod = True
    return method


class FontHandler:
    def __init__(self, backend, readOnly=False):
        self.backend = backend
        self.readOnly = readOnly
        self.connections = set()
        self.glyphUsedBy = {}
        self.glyphMadeOf = {}
        self.clientData = defaultdict(dict)
        self.changedGlyphs = {}
        if hasattr(self.backend, "watchExternalChanges"):
            self._watcherTask = asyncio.create_task(self.watchExternalChanges())

    async def close(self):
        self.backend.close()
        if hasattr(self, "_watcherTask"):
            self._watcherTask.cancel()
            await self._watcherTask

    async def watchExternalChanges(self):
        async for glyphNames in self.backend.watchExternalChanges():
            try:
                await self.reloadGlyphs(glyphNames)
            except Exception as e:
                logger.error("exception in external changes watcher: %r", e)

    @contextmanager
    def useConnection(self, connection):
        self.connections.add(connection)
        try:
            yield
        finally:
            self.connections.remove(connection)

    @remoteMethod
    def getGlyph(self, glyphName, *, connection):
        loadedGlyphNames = self.clientData[connection.clientUUID].setdefault(
            "loadedGlyphNames", set()
        )
        loadedGlyphNames.add(glyphName)
        glyph = self.changedGlyphs.get(glyphName)
        if glyph is not None:
            fut = asyncio.get_running_loop().create_future()
            fut.set_result(glyph)
            return fut
        return self._getGlyph(glyphName)

    async def getChangedGlyph(self, glyphName):
        glyph = self.changedGlyphs.get(glyphName)
        if glyph is None:
            glyph = await self._getGlyph(glyphName)
            self.changedGlyphs[glyphName] = glyph
        return glyph

    # @functools.lru_cache(250)  # see also reloadGlyphs
    def _getGlyph(self, glyphName):
        return asyncio.create_task(self._getGlyphFromBackend(glyphName))

    async def _getGlyphFromBackend(self, glyphName):
        glyphData = await self.backend.getGlyph(glyphName)
        self.updateGlyphDependencies(glyphName, glyphData)
        return glyphData

    @remoteMethod
    async def unloadGlyph(self, glyphName, *, connection):
        loadedGlyphNames = self.clientData[connection.clientUUID]["loadedGlyphNames"]
        loadedGlyphNames.discard(glyphName)

    @remoteMethod
    async def getReverseCmap(self, *, connection):
        return await self.backend.getReverseCmap()

    @remoteMethod
    async def getGlobalAxes(self, *, connection):
        return await self.backend.getGlobalAxes()

    @remoteMethod
    async def getUnitsPerEm(self, *, connection):
        return await self.backend.getUnitsPerEm()

    @remoteMethod
    async def getFontLib(self, *, connection):
        return await self.backend.getFontLib()

    @remoteMethod
    async def subscribeLiveGlyphChanges(self, glyphNames, *, connection):
        self.clientData[connection.clientUUID]["subscribedLiveGlyphNames"] = set(
            glyphNames
        )

    @remoteMethod
    async def editBegin(self, *, connection):
        ...

    @remoteMethod
    async def editSetRollback(self, rollbackChange, *, connection):
        ...

    @remoteMethod
    async def editDo(self, liveChange, *, connection):
        await self.broadcastChange(liveChange, connection, True)

    @remoteMethod
    async def editEnd(self, finalChange, *, connection):
        if finalChange is None:
            return
        # TODO: locking/checking
        await self.updateServerGlyph(finalChange)
        await self.broadcastChange(finalChange, connection, False)
        # return {"error": "computer says no"}

    @remoteMethod
    async def editAtomic(self, change, rollbackChange, *, connection):
        await self.editBegin(connection=connection)
        await self.editSetRollback(rollbackChange, connection=connection)
        await self.editEnd(change, connection=connection)

    async def broadcastChange(self, change, sourceConnection, isLiveChange):
        if isLiveChange:
            subscribedGlyphNamesKey = "subscribedLiveGlyphNames"
        else:
            subscribedGlyphNamesKey = "loadedGlyphNames"
        assert change["p"][0] == "glyphs", change["p"]
        glyphName = change["p"][1]
        connections = []
        for connection in self.connections:
            subscribedGlyphNames = self.clientData[connection.clientUUID].get(
                subscribedGlyphNamesKey, ()
            )
            if connection != sourceConnection and glyphName in subscribedGlyphNames:
                connections.append(connection)
        await asyncio.gather(
            *[connection.proxy.externalChange(change) for connection in connections]
        )

    async def updateServerGlyph(self, change):
        assert change["p"][0] == "glyphs", change["p"]
        glyphName = change["p"][1]
        glyph = await self.getChangedGlyph(glyphName)
        applyChange(dict(glyphs={glyphName: glyph}), change, glyphChangeFunctions)
        if hasattr(self.backend, "putGlyph") and not self.readOnly:
            await self.backend.putGlyph(glyphName, glyph)

    def iterGlyphMadeOf(self, glyphName):
        for dependantGlyphName in self.glyphMadeOf.get(glyphName, ()):
            yield dependantGlyphName
            yield from self.iterGlyphMadeOf(dependantGlyphName)

    def iterGlyphUsedBy(self, glyphName):
        for dependantGlyphName in self.glyphUsedBy.get(glyphName, ()):
            yield dependantGlyphName
            yield from self.iterGlyphUsedBy(dependantGlyphName)

    def updateGlyphDependencies(self, glyphName, glyphData):
        # Zap previous used-by data for this glyph, if any
        for componentName in self.glyphMadeOf.get(glyphName, ()):
            if componentName in self.glyphUsedBy:
                self.glyphUsedBy[componentName].discard(glyphName)
        componentNames = set(_iterAllComponentNames(glyphData))
        if componentNames:
            self.glyphMadeOf[glyphName] = componentNames
        elif glyphName in self.glyphMadeOf:
            del self.glyphMadeOf[glyphName]
        for componentName in componentNames:
            if componentName not in self.glyphUsedBy:
                self.glyphUsedBy[componentName] = set()
            self.glyphUsedBy[componentName].add(glyphName)

    async def reloadGlyphs(self, glyphNames):
        # XXX TODO For now, just drop any local changes
        for glyphName in glyphNames:
            if glyphName in self.changedGlyphs:
                del self.changedGlyphs[glyphName]

        # self._getGlyph.cache_clear()

        logger.info(f"broadcasting external glyph changes: {glyphNames}")
        connections = []
        for connection in self.connections:
            subscribedGlyphNames = self.clientData[connection.clientUUID].get(
                "loadedGlyphNames", ()
            )
            connGlyphNames = [
                glyphName
                for glyphName in glyphNames
                if glyphName in subscribedGlyphNames
            ]
            if connGlyphNames:
                connections.append((connection, connGlyphNames))
        await asyncio.gather(
            *[
                connection.proxy.reloadGlyphs(connGlyphNames)
                for connection, connGlyphNames in connections
            ]
        )


def _iterAllComponentNames(glyphData):
    for layer in glyphData["layers"]:
        for compo in layer["glyph"].get("components", ()):
            yield compo["name"]


def setPointPosition(path, pointIndex, x, y):
    coords = path["coordinates"]
    i = pointIndex * 2
    coords[i] = x
    coords[i + 1] = y


glyphChangeFunctions = {
    "=xy": setPointPosition,
}


glyphChangeFunctions.update(baseChangeFunctions)
