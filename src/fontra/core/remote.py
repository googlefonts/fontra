from __future__ import annotations

import asyncio
import logging
import traceback
from typing import Any, AsyncGenerator

from aiohttp import WSMsgType

from .classes import unstructure

logger = logging.getLogger(__name__)


class RemoteObjectConnectionException(Exception):
    pass


class RemoteObjectConnection:
    def __init__(self, websocket, path: str, subject: Any, verboseErrors: bool):
        self.websocket = websocket
        self.path = path
        self.subject = subject
        self.verboseErrors = verboseErrors
        self.clientUUID = None
        self.callReturnFutures: dict[str, asyncio.Future] = {}
        self.getNextServerCallID = _genNextServerCallID()

    @property
    def proxy(self) -> RemoteClientProxy:
        return RemoteClientProxy(self)

    async def handleConnection(self) -> None:
        message = await anext(aiter(self.websocket))
        message = message.json()
        self.clientUUID = message.get("client-uuid")
        if self.clientUUID is None:
            raise RemoteObjectConnectionException("unrecognized message")
        try:
            await self._handleConnection()
        except Exception as e:
            logger.error("error while handling incoming websocket messages: %r", e)
            if self.verboseErrors:
                traceback.print_exc()
            await self.websocket.close()

    async def _handleConnection(self) -> None:
        tasks: list[asyncio.Task] = []
        try:
            async for task in self._iterCallTasks():
                tasks = [task for task in tasks if not task.done()]
                task.add_done_callback(checkWebSocketTaskError)
                tasks.append(task)
        finally:
            # The websocket closed: cancel all pending call tasks, as they will have
            # no way to communicate their result back to the now-closed websocket.
            for task in tasks:
                if not task.done():
                    task.cancel()

    async def _iterCallTasks(self) -> AsyncGenerator[asyncio.Task, None]:
        async for message in self.websocket:
            if message.type == WSMsgType.ERROR:
                # We need to explicitly check for an error, or else
                # message.json() will fail with a TypeError.
                # https://github.com/aio-libs/aiohttp/issues/7313#issuecomment-1586150267
                raise message.data
            message = message.json()

            if message.get("connection") == "close":
                logger.info("client requested connection close")
                break
            if "client-call-id" in message:
                # this is an incoming client -> server call
                yield asyncio.create_task(self._performCall(message, self.subject))
            elif "server-call-id" in message:
                # this is a response to a server -> client call
                fut = self.callReturnFutures[message["server-call-id"]]
                returnValue = message.get("return-value")
                error = message.get("error")
                if error is None:
                    fut.set_result(returnValue)
                else:
                    fut.set_exception(RemoteObjectConnectionException(error))
            else:
                logger.info("invalid message, closing connection")
                break

    async def _performCall(self, message: dict, subject: Any) -> None:
        clientCallID = "unknown-client-call-id"
        try:
            clientCallID = message["client-call-id"]
            methodName = message["method-name"]
            arguments = message.get("arguments", [])
            methodHandler = getattr(subject, methodName, None)
            if methodHandler is not None and getattr(
                methodHandler, "fontraRemoteMethod", False
            ):
                returnValue = await methodHandler(*arguments, connection=self)
                returnValue = unstructure(returnValue)
                response = {"client-call-id": clientCallID, "return-value": returnValue}
            else:
                response = {
                    "client-call-id": clientCallID,
                    "exception": f"unknown method {methodName}",
                }
        except Exception as e:
            logger.error("uncaught exception: %r", e)
            if self.verboseErrors:
                traceback.print_exc()
            response = {"client-call-id": clientCallID, "exception": repr(e)}
        await self.sendMessage(response)

    async def sendMessage(self, message):
        await self.websocket.send_json(message)


class RemoteClientProxy:
    def __init__(self, connection):
        self._connection = connection

    def __getattr__(self, methodName):
        if methodName.startswith("_"):
            return super().__getattr__(methodName)

        async def methodWrapper(*args):
            serverCallID = next(self._connection.getNextServerCallID)
            message = {
                "server-call-id": serverCallID,
                "method-name": methodName,
                "arguments": args,
            }
            returnFuture = asyncio.get_running_loop().create_future()
            self._connection.callReturnFutures[serverCallID] = returnFuture
            await self._connection.sendMessage(message)
            return await returnFuture

        return methodWrapper


def _genNextServerCallID():
    serverCallID = 0
    while True:
        yield serverCallID
        serverCallID += 1


def checkWebSocketTaskError(task):
    if task.cancelled():
        return
    exc = task.exception()
    if exc is None:
        return
    if isinstance(exc, ConnectionResetError):
        # The client is gone, there's no need to be sad about it
        return
    logger.error(f"exception in {task}", exc_info=exc)
