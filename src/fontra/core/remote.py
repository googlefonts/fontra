import asyncio
import logging
import traceback
from dataclasses import asdict, is_dataclass

from aiohttp import WSMsgType

logger = logging.getLogger(__name__)


class RemoteObjectConnectionException(Exception):
    pass


class RemoteObjectConnection:
    def __init__(self, websocket, path, subject, verboseErrors):
        self.websocket = websocket
        self.path = path
        self.subject = subject
        self.verboseErrors = verboseErrors
        self.clientUUID = None
        self.callReturnFutures = {}
        self.getNextServerCallID = _genNextServerCallID()

    @property
    def proxy(self):
        return RemoteClientProxy(self)

    async def handleConnection(self):
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

    async def _handleConnection(self):
        tasks = []
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
            tasks = [task for task in tasks if not task.done()]
            if "client-call-id" in message:
                # this is an incoming client -> server call
                tasks.append(
                    asyncio.create_task(self._performCall(message, self.subject))
                )
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

    async def _performCall(self, message, subject):
        clientCallID = "unknown-client-call-id"
        try:
            clientCallID = message["client-call-id"]
            methodName = message["method-name"]
            arguments = message.get("arguments", [])
            methodHandler = getattr(subject, methodName, None)
            if getattr(methodHandler, "fontraRemoteMethod", False):
                returnValue = await methodHandler(*arguments, connection=self)
                if is_dataclass(returnValue):
                    returnValue = asdict(returnValue)
                elif (
                    isinstance(returnValue, list)
                    and returnValue
                    and is_dataclass(returnValue[0])
                ):
                    returnValue = [asdict(item) for item in returnValue]
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


try:
    anext
except NameError:
    # Python < 3.10
    def aiter(iterable):
        return iterable.__aiter__()

    def anext(it):
        return it.__anext__()
