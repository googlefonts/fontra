from contextlib import contextmanager
import asyncio
from collections import defaultdict
from copy import deepcopy
import functools
import logging
from .changes import applyChange
from .glyphnames import getSuggestedGlyphName, getUnicodeFromGlyphName


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
        self._processGlyphWritesEvent = asyncio.Event()
        self._processGlyphWritesTask = asyncio.create_task(self.processGlyphWrites())
        self._glyphsScheduledForWrite = {}

    async def close(self):
        self.backend.close()
        if hasattr(self, "_watcherTask"):
            self._watcherTask.cancel()
        self._processGlyphWritesTask.cancel()

    async def watchExternalChanges(self):
        async for glyphNames in self.backend.watchExternalChanges():
            try:
                await self.reloadGlyphs(glyphNames)
            except Exception as e:
                logger.error("exception in external changes watcher: %r", e)

    async def processGlyphWrites(self):
        while True:
            await self._processGlyphWritesEvent.wait()
            while self._glyphsScheduledForWrite:
                glyphName, glyph = popFirstItem(self._glyphsScheduledForWrite)
                logger.info(f"write {glyphName} to backend")
                try:
                    await self.backend.putGlyph(glyphName, glyph)
                except Exception as e:
                    logger.error("exception while writing glyph: %r", e)
                    # TODO: notify the source connection
                    await self.reloadGlyphs([glyphName])
                await asyncio.sleep(0)
            self._processGlyphWritesEvent.clear()

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
        glyph = await self.backend.getGlyph(glyphName)
        self.updateGlyphDependencies(glyphName, glyph)
        return glyph

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
    async def editIncremental(self, liveChange, *, connection):
        await self.broadcastChange(liveChange, connection, True)

    @remoteMethod
    async def editFinal(self, finalChange, rollbackChange, editLabel, broadcast=False, *, connection):
        # TODO: use finalChange, rollbackChange, editLabel for history recording
        # TODO: locking/checking
        await self.updateServerGlyph(finalChange)
        # return {"error": "computer says no"}
        if broadcast:
            await self.broadcastChange(finalChange, connection, False)

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
        applyChange(dict(glyphs={glyphName: glyph}), change)
        if hasattr(self.backend, "putGlyph") and not self.readOnly:
            self.scheduleGlyphWrite(glyphName, glyph)

    def scheduleGlyphWrite(self, glyphName, glyph):
        shouldSignal = not self._glyphsScheduledForWrite
        self._glyphsScheduledForWrite[glyphName] = deepcopy(glyph)
        if shouldSignal:
            self._processGlyphWritesEvent.set()

    def iterGlyphMadeOf(self, glyphName):
        for dependantGlyphName in self.glyphMadeOf.get(glyphName, ()):
            yield dependantGlyphName
            yield from self.iterGlyphMadeOf(dependantGlyphName)

    def iterGlyphUsedBy(self, glyphName):
        for dependantGlyphName in self.glyphUsedBy.get(glyphName, ()):
            yield dependantGlyphName
            yield from self.iterGlyphUsedBy(dependantGlyphName)

    def updateGlyphDependencies(self, glyphName, glyph):
        # Zap previous used-by data for this glyph, if any
        for componentName in self.glyphMadeOf.get(glyphName, ()):
            if componentName in self.glyphUsedBy:
                self.glyphUsedBy[componentName].discard(glyphName)
        componentNames = set(_iterAllComponentNames(glyph))
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

    @remoteMethod
    async def getSuggestedGlyphName(self, codePoint, *, connection):
        return getSuggestedGlyphName(codePoint)

    @remoteMethod
    async def getUnicodeFromGlyphName(self, glyphName, *, connection):
        return getUnicodeFromGlyphName(glyphName)


def _iterAllComponentNames(glyph):
    for layer in glyph.layers:
        for compo in layer.glyph.components:
            yield compo.name


def popFirstItem(d):
    key = next(iter(d))
    return (key, d.pop(key))
