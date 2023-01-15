from contextlib import contextmanager
import asyncio
from collections import defaultdict
from copy import deepcopy
from dataclasses import dataclass
import functools
import logging
import traceback
from typing import Any
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


@dataclass
class FontHandler:
    backend: Any  # TODO: need Backend protocol
    readOnly: bool = False

    def __post_init__(self):
        if not hasattr(self.backend, "putGlyph"):
            self.readOnly = True
        self.connections = set()
        self.glyphUsedBy = {}
        self.glyphMadeOf = {}
        self.clientData = defaultdict(dict)
        self.changedGlyphs = {}  # TODO: should perhaps be a LRU cache
        self._glyphsScheduledForWrite = {}

    async def startTasks(self):
        if hasattr(self.backend, "watchExternalChanges"):
            self._watcherTask = asyncio.create_task(self.processExternalChanges())
            self._watcherTask.add_done_callback(taskDoneHelper)
        self._processGlyphWritesError = None
        self._processGlyphWritesEvent = asyncio.Event()
        self._processGlyphWritesTask = asyncio.create_task(self.processGlyphWrites())
        self._processGlyphWritesTask.add_done_callback(self._processGlyphWritesTaskDone)
        self._processGlyphWritesTask.add_done_callback(taskDoneHelper)
        self._writingInProgressEvent = asyncio.Event()
        self._writingInProgressEvent.set()

    async def close(self):
        self.backend.close()
        if hasattr(self, "_watcherTask"):
            self._watcherTask.cancel()
        if hasattr(self, "_processGlyphWritesTask"):
            await self.finishWriting()  # shield for cancel?
            self._processGlyphWritesTask.cancel()

    async def processExternalChanges(self):
        async for change, reloadPattern in self.backend.watchExternalChanges():
            try:
                if change is not None:
                    await self.broadcastChange(change, None, False)
                if reloadPattern is not None:
                    await self.reloadData(reloadPattern)
            except Exception as e:
                logger.error("exception in external changes watcher: %r", e)

    def _processGlyphWritesTaskDone(self, task):
        # Signal that the glyph-writes-"thread" is no longer running
        self._glyphsScheduledForWrite = None

    async def finishWriting(self):
        if self._processGlyphWritesError is not None:
            raise self._processGlyphWritesError
        await self._writingInProgressEvent.wait()

    async def processGlyphWrites(self):
        while True:
            await self._processGlyphWritesEvent.wait()
            try:
                await self._processGlyphWritesOneCycle()
            except Exception as e:
                self._processGlyphWritesError = e
                raise
            finally:
                self._processGlyphWritesEvent.clear()
                self._writingInProgressEvent.set()

    async def _processGlyphWritesOneCycle(self):
        while self._glyphsScheduledForWrite:
            glyphName, (glyph, connection) = popFirstItem(self._glyphsScheduledForWrite)
            logger.info(f"write {glyphName} to backend")
            try:
                errorMessage = await self.backend.putGlyph(glyphName, glyph)
            except Exception as e:
                logger.error("exception while writing glyph: %r", e)
                traceback.print_exc()
                await self.reloadGlyphs([glyphName])
                if connection is not None:
                    await connection.proxy.messageFromServer(
                        "The glyph could not be saved due to an error.",
                        f"The edit has been reverted.\n\n{e}",
                    )
                else:
                    # For testing, when connection is None
                    raise
            else:
                if errorMessage:
                    await self.reloadGlyphs([glyphName])
                    await connection.proxy.messageFromServer(
                        "The glyph could not be saved.",
                        f"The edit has been reverted.\n\n{errorMessage}",
                    )
            await asyncio.sleep(0)

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
    async def getGlyphMap(self, *, connection):
        return await self.backend.getGlyphMap()

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
        return self.clientData[connection.clientUUID].get(key, default)

    @remoteMethod
    async def subscribeChanges(self, pathOrPattern, wantLiveChanges, *, connection):
        self._adjustMatchPattern(
            addToPattern, pathOrPattern, wantLiveChanges, connection
        )

    @remoteMethod
    async def unsubscribeChanges(self, pathOrPattern, wantLiveChanges, *, connection):
        self._adjustMatchPattern(
            removeFromPattern, pathOrPattern, wantLiveChanges, connection
        )

    def _adjustMatchPattern(self, func, pathOrPattern, wantLiveChanges, connection):
        key = LIVE_CHANGES_PATTERN_KEY if wantLiveChanges else CHANGES_PATTERN_KEY
        matchPattern = self._getClientData(connection, key, {})
        self.clientData[connection.clientUUID][key] = func(matchPattern, pathOrPattern)

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

    async def broadcastChange(self, change, sourceConnection, wantLiveChanges):
        if wantLiveChanges:
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
            self._processGlyphWritesEvent.set()  # write: go!
            self._writingInProgressEvent.clear()

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

    async def reloadData(self, reloadPattern):
        glyphNames = sorted(reloadPattern.get("glyphs", {}))
        if glyphNames:
            await self.reloadGlyphs(glyphNames)

    async def reloadGlyphs(self, glyphNames):
        glyphNames = set(glyphNames)
        # XXX TODO For now, just drop any local changes
        for glyphName in glyphNames:
            if glyphName in self.changedGlyphs:
                del self.changedGlyphs[glyphName]

        # self._getGlyph.cache_clear()

        logger.info(f"broadcasting external glyph changes: {glyphNames}")
        connections = []
        for connection in self.connections:
            subscribedGlyphNames = self._getAllSubscribedGlyphNames(connection)
            connGlyphNames = sorted(glyphNames & subscribedGlyphNames)
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
