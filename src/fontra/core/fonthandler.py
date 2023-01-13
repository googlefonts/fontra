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
    pathToPattern,
    subtractFromPattern,
)
from .glyphnames import getSuggestedGlyphName, getUnicodeFromGlyphName
from .lrucache import LRUCache


logger = logging.getLogger(__name__)


CHANGES_PATTERN_KEY = "changes-match-pattern"
LIVE_CHANGES_PATTERN_KEY = "live-changes-match-pattern"


def remoteMethod(method):
    method.fontraRemoteMethod = True
    return method


backendAttrMapping = [
    ("axes", "getGlobalAxes", "setGlobalAxes"),
    ("glyphMap", "getGlyphMap", "setGlyphMap"),
    ("lib", "getFontLib", "setFontLib"),
    ("unitsPerEm", "getUnitsPerEm", "setUnitsPerEm"),
]

backendGetterNames = {attr: getter for attr, getter, setter in backendAttrMapping}
backendSetterNames = {attr: setter for attr, getter, setter in backendAttrMapping}


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
        self.localData = LRUCache()
        self._dataScheduledForWrite = {}

    async def startTasks(self):
        if hasattr(self.backend, "watchExternalChanges"):
            self._watcherTask = asyncio.create_task(self.processExternalChanges())
            self._watcherTask.add_done_callback(taskDoneHelper)
        self._processWritesError = None
        self._processWritesEvent = asyncio.Event()
        self._processWritesTask = asyncio.create_task(self.processWrites())
        self._processWritesTask.add_done_callback(self._processWritesTaskDone)
        self._processWritesTask.add_done_callback(taskDoneHelper)
        self._writingInProgressEvent = asyncio.Event()
        self._writingInProgressEvent.set()

    async def close(self):
        self.backend.close()
        if hasattr(self, "_watcherTask"):
            self._watcherTask.cancel()
        if hasattr(self, "_processWritesTask"):
            await self.finishWriting()  # shield for cancel?
            self._processWritesTask.cancel()

    async def processExternalChanges(self):
        async for change, reloadPattern in self.backend.watchExternalChanges():
            try:
                if change is not None:
                    await self.broadcastChange(change, None, False)
                if reloadPattern is not None:
                    await self.reloadData(reloadPattern)
            except Exception as e:
                logger.error("exception in external changes watcher: %r", e)

    def _processWritesTaskDone(self, task):
        # Signal that the write-"thread" is no longer running
        self._dataScheduledForWrite = None

    async def finishWriting(self):
        if self._processWritesError is not None:
            raise self._processWritesError
        await self._writingInProgressEvent.wait()

    async def processWrites(self):
        while True:
            await self._processWritesEvent.wait()
            try:
                await self._processWritesOneCycle()
            except Exception as e:
                self._processWritesError = e
                raise
            finally:
                self._processWritesEvent.clear()
                self._writingInProgressEvent.set()

    async def _processWritesOneCycle(self):
        while self._dataScheduledForWrite:
            writeKey, (writeFunc, connection) = popFirstItem(
                self._dataScheduledForWrite
            )
            reloadPattern = _writeKeyToPattern(writeKey)
            logger.info(f"write {writeKey} to backend")
            try:
                errorMessage = await writeFunc()
            except Exception as e:
                logger.error("exception while writing data: %r", e)
                traceback.print_exc()
                await self.reloadData(reloadPattern)
                if connection is not None:
                    await connection.proxy.messageFromServer(
                        "The data could not be saved due to an error.",
                        f"The edit has been reverted.\n\n{e}",
                    )
                else:
                    # For testing, when connection is None
                    raise
            else:
                if errorMessage:
                    await self.reloadData(reloadPattern)
                    await connection.proxy.messageFromServer(
                        "The data could not be saved.",
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
        glyph = self.localData.get(("glyphs", glyphName))
        if glyph is None:
            glyph = await self._getGlyph(glyphName)
        return glyph

    async def getLocalGlyph(self, glyphName):
        glyph = self.localData.get(("glyphs", glyphName))
        if glyph is None:
            glyph = await self._getGlyph(glyphName)
            self.localData[("glyphs", glyphName)] = glyph
        return glyph

    def _getGlyph(self, glyphName):
        return asyncio.create_task(self._getGlyphFromBackend(glyphName))

    async def _getGlyphFromBackend(self, glyphName):
        glyph = await self.backend.getGlyph(glyphName)
        self.updateGlyphDependencies(glyphName, glyph)
        return glyph

    async def getLocalData(self, key):
        data = self.localData.get(key)
        if data is None:
            data = await self._getData(key)
            self.localData[key] = data
        return data

    async def _getData(self, key):
        getterName = backendGetterNames[key]
        return await getattr(self.backend, getterName)()

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

    def _setClientData(self, connection, key, value):
        self.clientData[connection.clientUUID][key] = value

    @remoteMethod
    async def subscribeChanges(self, pathOrPattern, wantLiveChanges, *, connection):
        self._adjustMatchPattern(
            addToPattern, pathOrPattern, wantLiveChanges, connection
        )

    @remoteMethod
    async def unsubscribeChanges(self, pathOrPattern, wantLiveChanges, *, connection):
        self._adjustMatchPattern(
            subtractFromPattern, pathOrPattern, wantLiveChanges, connection
        )

    def _adjustMatchPattern(self, func, pathOrPattern, wantLiveChanges, connection):
        key = LIVE_CHANGES_PATTERN_KEY if wantLiveChanges else CHANGES_PATTERN_KEY
        matchPattern = self._getClientData(connection, key, {})
        self._setClientData(connection, key, func(matchPattern, pathOrPattern))

    @remoteMethod
    async def editIncremental(self, liveChange, *, connection):
        await self.broadcastChange(liveChange, connection, True)

    @remoteMethod
    async def editFinal(
        self, finalChange, rollbackChange, editLabel, broadcast=False, *, connection
    ):
        # TODO: use finalChange, rollbackChange, editLabel for history recording
        # TODO: locking/checking
        await self.updateLocalData(finalChange, connection)
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

    async def updateLocalData(self, change, connection):
        glyphNames = []
        glyphSet = {}
        rootObject = {}
        rootKeys = [p[0] for p in collectChangePaths(change, 1)]
        for rootKey in rootKeys:
            if rootKey == "glyphs":
                glyphNames = [
                    glyphName
                    for key, glyphName in collectChangePaths(change, 2)
                    if key == "glyphs"
                ]
                data = glyphSet = {
                    glyphName: await self.getLocalGlyph(glyphName)
                    for glyphName in glyphNames
                }
            else:
                data = await self.getLocalData(rootKey)
            rootObject[rootKey] = data

        applyChange(rootObject, change)

        if self.readOnly:
            return

        for rootKey in rootKeys:
            if rootKey == "glyphs":
                for glyphName in glyphNames:
                    writeFunc = functools.partial(
                        self.backend.putGlyph, glyphName, deepcopy(glyphSet[glyphName])
                    )
                    writeKey = ("glyphs", glyphName)
                    await self.scheduleDataWrite(writeKey, writeFunc, connection)
            else:
                # TODO
                raise NotImplementedError()

    async def scheduleDataWrite(self, writeKey, writeFunc, connection):
        if self._dataScheduledForWrite is None:
            # The write-"thread" is no longer running
            await self.reloadData(_writeKeyToPattern(writeKey))
            await connection.proxy.messageFromServer(
                "The glyph could not be saved.",
                "The edit has been reverted.\n\n"  # no trailing comma
                "The Fontra server got itself into trouble, please contact an admin.",
            )
            return
        shouldSignal = not self._dataScheduledForWrite
        self._dataScheduledForWrite[writeKey] = (writeFunc, connection)
        if shouldSignal:
            self._processWritesEvent.set()  # write: go!
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
        else:
            # TODO: implement reloadGlyphs in terms of reloadData
            # instead of the other way around
            raise NotImplementedError()

    async def reloadGlyphs(self, glyphNames):
        glyphNames = set(glyphNames)
        # XXX TODO For now, just drop any local changes
        for glyphName in glyphNames:
            self.localData.pop(("glyphs", glyphName), None)

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


def _writeKeyToPattern(writeKey):
    if not isinstance(writeKey, tuple):
        writeKey = (writeKey,)
    return pathToPattern(writeKey)
