import asyncio
import logging
import os
from dataclasses import dataclass, field
from typing import Callable, Iterable

from watchfiles import Change, awatch

logger = logging.getLogger(__name__)


@dataclass
class FileWatcher:
    callback: Callable
    paths: set[os.PathLike | str] = field(init=False, default_factory=set)
    _stopEvent: asyncio.Event = field(init=False, default=asyncio.Event())
    _task: asyncio.Task | None = field(init=False, default=None)

    async def aclose(self) -> None:
        if self._task is None:
            return
        self._stopEvent.set()
        self._task.cancel()

    def setPaths(self, paths: Iterable[os.PathLike | str]) -> None:
        self.paths = set(paths)
        self._startWatching()

    def addPaths(self, paths: Iterable[os.PathLike | str]) -> None:
        self.paths.update(paths)
        self._startWatching()

    def removePaths(self, paths: Iterable[os.PathLike | str]) -> None:
        for path in paths:
            self.paths.discard(path)
        self._startWatching()

    def _startWatching(self):
        self._stopEvent.set()
        self._task = asyncio.create_task(self._watchFiles()) if self.paths else None

    async def _watchFiles(self):
        self._stopEvent = asyncio.Event()
        async for changes in awatch(*sorted(self.paths), stop_event=self._stopEvent):
            changes = cleanupWatchFilesChanges(changes)
            try:
                await self.callback(changes)
            except Exception:
                logger.exception("exception in FileWatcher callback")


def cleanupWatchFilesChanges(changes):
    # If a path is mentioned with more than one event type, we pick the most
    # appropriate one among them:
    # - if there is a delete event and the path does not exist: delete it is
    # - else: keep the lowest sorted event (order: added, modified, deleted)
    perPath = {}
    for change, path in sorted(changes):
        if path in perPath:
            if change == Change.deleted and not os.path.exists(path):
                # File doesn't exist, event to "deleted"
                perPath[path] = Change.deleted
            # else: keep the first event
        else:
            perPath[path] = change
    return [(change, path) for path, change in perPath.items()]
