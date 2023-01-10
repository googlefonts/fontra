from contextlib import contextmanager
import asyncio
from collections import defaultdict
from copy import deepcopy
import functools
import logging
import traceback
from .changes import (
    addToPattern,
    applyChange,
    collectChangePaths,
    filterChangePattern,
    matchChangePattern,
    removeFromPattern,
)
from .glyphnames import getSuggestedGlyphName, getUnicodeFromGlyphName


logger = logging.getLogger(__name__)


CHANGES_PATTERN_KEY = "changes-match-pattern"
LIVE_CHANGES_PATTERN_KEY = "live-changes-match-pattern"


def remoteMethod(method):
    method.fontraRemoteMethod = True
    return method


class FontHandler:
    def __init__(self, backend, readOnly=False):
        self.backend = backend
        if not hasattr(self.backend, "putGlyph"):
            readOnly = True
        self.readOnly = readOnly
        self.connections = set()
        self.glyphUsedBy = {}
        self.glyphMadeOf = {}
        self.clientData = defaultdict(dict)
        self.changedGlyphs = {}  # TODO: should perhaps be a LRU cache
        if hasattr(self.backend, "watchExternalChanges"):
            self._watcherTask = asyncio.create_task(self.watchExternalChanges())
            self._watcherTask.add_done_callback(taskDoneHelper)
        self._processGlyphWritesEvent = asyncio.Event()
        self._processGlyphWritesTask = asyncio.create_task(self.processGlyphWrites())
        self._processGlyphWritesTask.add_done_callback(self._processGlyphWritesTaskDone)
        self._processGlyphWritesTask.add_done_callback(taskDoneHelper)
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

    def _processGlyphWritesTaskDone(self, task):
        # Signal that the glyph-writes-"thread" is no longer running
        self._glyphsScheduledForWrite = None

    async def processGlyphWrites(self):
        while True:
            await self._processGlyphWritesEvent.wait()
            while self._glyphsScheduledForWrite:
                glyphName, (glyph, connection) = popFirstItem(
                    self._glyphsScheduledForWrite
                )
                logger.info(f"write {glyphName} to backend")
                try:
                    errorMessage = await self.backend.putGlyph(glyphName, glyph)
                except Exception as e:
                    logger.error("exception while writing glyph: %r", e)
                    traceback.print_exc()
                    await self.reloadGlyphs([glyphName])
                    await connection.proxy.messageFromServer(
                        "The glyph could not be saved due to an error.",
                        f"The edit has been reverted.\n\n{e}",
                    )
                else:
                    if errorMessage:
                        await self.reloadGlyphs([glyphName])
                        await connection.proxy.messageFromServer(
                            "The glyph could not be saved.",
                            f"The edit has been reverted.\n\n{errorMessage}",
                        )
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
    async def getGlyph(self, glyphName, *, connection):
        glyph = self.changedGlyphs.get(glyphName)
        if glyph is None:
            glyph = await self._getGlyph(glyphName)
        return glyph

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

    def _getClientData(self, connection, key, default=None):
        return self.clientData[connection.clientUUID].setdefault(key, default)

    @remoteMethod
    async def subscribeChanges(self, pathOrPattern, *, connection):
        matchPattern = self._getClientData(connection, CHANGES_PATTERN_KEY, {})
        addToPattern(matchPattern, pathOrPattern)

    @remoteMethod
    async def unsubscribeChanges(self, pathOrPattern, *, connection):
        matchPattern = self._getClientData(connection, CHANGES_PATTERN_KEY, {})
        removeFromPattern(matchPattern, pathOrPattern)

    @remoteMethod
    async def subscribeLiveChanges(self, pathOrPattern, *, connection):
        matchPattern = self._getClientData(connection, LIVE_CHANGES_PATTERN_KEY, {})
        addToPattern(matchPattern, pathOrPattern)

    @remoteMethod
    async def unsubscribeLiveChanges(self, pathOrPattern, *, connection):
        matchPattern = self._getClientData(connection, LIVE_CHANGES_PATTERN_KEY, {})
        removeFromPattern(matchPattern, pathOrPattern)

    @remoteMethod
    async def editIncremental(self, liveChange, *, connection):
        await self.broadcastChange(liveChange, connection, True)

    @remoteMethod
    async def editFinal(
        self, finalChange, rollbackChange, editLabel, broadcast=False, *, connection
    ):
        # TODO: use finalChange, rollbackChange, editLabel for history recording
        # TODO: locking/checking
        await self.updateServerGlyphs(finalChange, connection)
        # return {"error": "computer says no"}
        if broadcast:
            await self.broadcastChange(finalChange, connection, False)

    async def broadcastChange(self, change, sourceConnection, isLiveChange):
        if isLiveChange:
            matchPatternKeys = [LIVE_CHANGES_PATTERN_KEY]
        else:
            matchPatternKeys = [LIVE_CHANGES_PATTERN_KEY, CHANGES_PATTERN_KEY]

        connections = [
            connection
            for connection in self.connections
            if connection != sourceConnection
            and any(
                matchChangePattern(change, self._getClientData(connection, k, {}))
                for k in matchPatternKeys
            )
        ]

        await asyncio.gather(
            *[connection.proxy.externalChange(change) for connection in connections]
        )

    async def updateServerGlyphs(self, change, connection):
        change = filterChangePattern(change, {"glyphs": None})
        glyphNames = [glyphName for _, glyphName in collectChangePaths(change, 2)]
        glyphs = {
            glyphName: await self.getChangedGlyph(glyphName) for glyphName in glyphNames
        }
        applyChange(dict(glyphs=glyphs), change)
        if not self.readOnly:
            for glyphName in glyphNames:
                await self.scheduleGlyphWrite(glyphName, glyphs[glyphName], connection)

    async def scheduleGlyphWrite(self, glyphName, glyph, connection):
        if self._glyphsScheduledForWrite is None:
            # The glyph-writes-"thread" is no longer running
            await self.reloadGlyphs([glyphName])
            await connection.proxy.messageFromServer(
                "The glyph could not be saved.",
                "The edit has been reverted.\n\n"  # no trailing comma
                "The Fontra server got itself into trouble, please contact an admin.",
            )
            return
        shouldSignal = not self._glyphsScheduledForWrite
        self._glyphsScheduledForWrite[glyphName] = (deepcopy(glyph), connection)
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
            subscribedGlyphNames = self._getAllSubscribedGlyphNames(connection)
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

    def _getAllSubscribedGlyphNames(self, connection):
        subscribedGlyphNames = set()
        for key in [LIVE_CHANGES_PATTERN_KEY, CHANGES_PATTERN_KEY]:
            matchPattern = self._getClientData(connection, key, {})
            subscribedGlyphNames.update(matchPattern.get("glyphs", {}))
        return subscribedGlyphNames

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


def taskDoneHelper(task):
    if not task.cancelled() and task.exception() is not None:
        logger.exception(
            f"fatal exception in asyncio task {task}", exc_info=task.exception()
        )
