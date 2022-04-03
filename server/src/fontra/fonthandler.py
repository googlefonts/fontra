from contextlib import contextmanager
import asyncio
from collections import defaultdict
import functools
import logging
from .changes import applyChange, baseChangeFunctions


logger = logging.getLogger(__name__)


class FontHandler:
    def __init__(self, backend):
        self.backend = backend
        self.connections = set()
        self.remoteMethodNames = {
            "changeBegin",
            "changeSetRollback",
            "changeChanging",
            "changeEnd",
            "getGlyph",
            "unloadGlyph",
            "getGlyphNames",
            "getReverseCmap",
            "getGlobalAxes",
            "subscribeLiveGlyphChanges",
        }
        self.glyphUsedBy = {}
        self.glyphMadeOf = {}
        self.clientData = defaultdict(dict)
        self.changedGlyphs = {}
        self.setupExternalChangesWatcher()

    def setupExternalChangesWatcher(self):
        if not hasattr(self.backend, "watchExternalChanges"):
            return
        task = self.backend.watchExternalChanges(self.externalChangesCallback)

        def watcherTaskDone(task):
            e = task.exception()
            if e is not None:
                logger.error("exception in external changes watcher: %r", e)

        task.add_done_callback(watcherTaskDone)
        self._externalWatcherTask = task

    @contextmanager
    def useConnection(self, connection):
        self.connections.add(connection)
        try:
            yield
        finally:
            self.connections.remove(connection)

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

    @functools.lru_cache(250)
    def _getGlyph(self, glyphName):
        return asyncio.create_task(self._getGlyphFromBackend(glyphName))

    async def _getGlyphFromBackend(self, glyphName):
        glyphData = await self.backend.getGlyph(glyphName)
        self.updateGlyphDependencies(glyphName, glyphData)
        return glyphData

    async def unloadGlyph(self, glyphName, *, connection):
        loadedGlyphNames = self.clientData[connection.clientUUID]["loadedGlyphNames"]
        loadedGlyphNames.discard(glyphName)

    async def getReverseCmap(self, *, connection):
        return await self.backend.getReverseCmap()

    async def getGlobalAxes(self, *, connection):
        return await self.backend.getGlobalAxes()

    async def subscribeLiveGlyphChanges(self, glyphNames, *, connection):
        self.clientData[connection.clientUUID]["subscribedLiveGlyphNames"] = set(
            glyphNames
        )

    async def changeBegin(self, *, connection):
        ...

    async def changeSetRollback(self, rollbackChange, *, connection):
        ...

    async def changeChanging(self, liveChange, *, connection):
        await self.broadcastChange(liveChange, connection, True)

    async def changeEnd(self, finalChange, *, connection):
        if finalChange is None:
            return
        await self.updateServerGlyph(finalChange)
        await self.broadcastChange(finalChange, connection, False)
        # return {"error": "computer says no"}

    async def broadcastChange(self, change, sourceConnection, isLiveChange):
        if isLiveChange:
            subscribedGlyphNamesKey = "subscribedLiveGlyphNames"
        else:
            subscribedGlyphNamesKey = "loadedGlyphNames"
        assert change["p"][0] == "glyphs"
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
        assert change["p"][0] == "glyphs"
        glyphName = change["p"][1]
        glyph = await self.getChangedGlyph(glyphName)
        applyChange(dict(glyphs={glyphName: glyph}), change, glyphChangeFunctions)

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

    async def externalChangesCallback(self, glyphNames):
        # XXX TODO For now, just drop any local changes
        for glyphName in glyphNames:
            if glyphName in self.changedGlyphs:
                del self.changedGlyphs[glyphName]

        self._getGlyph.cache_clear()

        logger.info(f"broadcasting external glyph changes: {glyphNames}")
        connections = []
        for connection in self.connections:
            subscribedGlyphNames = self.clientData[connection.clientUUID].get(
                "loadedGlyphNames", ()
            )
            if glyphName in subscribedGlyphNames:
                connections.append(connection)
        await asyncio.gather(
            *[connection.proxy.reloadGlyphs(glyphNames) for connection in connections]
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
