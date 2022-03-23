import asyncio
import json
import logging
import traceback
from urllib.parse import unquote
import websockets


logger = logging.getLogger(__name__)


class WebSocketServer:
    def __init__(self, subjectManager, *, verboseErrors=False):
        self.subjectManager = subjectManager
        self.verboseErrors = verboseErrors

    def getServerTask(self, host="localhost", port=8001):
        return websockets.serve(self.incomingConnection, host, port)

    def run(self, host="localhost", port=8001):
        startServer = self.getServerTask()
        asyncio.get_event_loop().run_until_complete(startServer)
        asyncio.get_event_loop().run_forever()

    async def incomingConnection(self, websocket, path):
        path = unquote(path)
        try:
            subject = await self.getSubject(websocket, path)
        except Exception as e:
            logger.error("error while handling incoming websocket messages: %r", e)
            if self.verboseErrors:
                traceback.print_exc()
            await websocket.close()
        else:
            connection = WebSocketConnection(
                websocket, path, subject, self.verboseErrors
            )
            with subject.useConnection(connection):
                await connection.handleConnection()

    async def getSubject(self, websocket, path):
        message = await async_next(websocket)
        message = json.loads(message)
        if "client-uuid" not in message:
            raise WebSocketConnectionException("unrecognized message")
        self.clientUUID = message["client-uuid"]
        token = message.get("autorization-token")
        remoteIP = websocket.remote_address[0]
        subject = await self.subjectManager.getRemoteSubject(path, token, remoteIP)
        if subject is None:
            raise WebSocketConnectionException("unauthorized")
        return subject


class WebSocketConnectionException(Exception):
    pass


class WebSocketConnection:
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
        return ClientProxy(self)

    async def handleConnection(self):
        logger.info(f"incoming connection: {self.path!r}")
        try:
            await self._handleConnection()
        except websockets.exceptions.ConnectionClosedError as e:
            logger.info(f"websocket connection closed: {e!r}")
        except Exception as e:
            logger.error("error while handling incoming websocket messages: %r", e)
            if self.verboseErrors:
                traceback.print_exc()
            await self.websocket.close()

    async def _handleConnection(self):
        tasks = []
        async for message in self.websocket:
            message = json.loads(message)
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
                    fut.set_exception(WebSocketConnectionException(error))
            else:
                logger.info("invalid message, closing connection")
                break

    async def _performCall(self, message, subject):
        clientCallID = "unknown-client-call-id"
        try:
            clientCallID = message["client-call-id"]
            methodName = message["method-name"]
            arguments = message.get("arguments", [])
            if methodName in subject.remoteMethodNames:
                methodHandler = getattr(subject, methodName)
                returnValue = await methodHandler(*arguments, connection=self)
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
        await self.websocket.send(json.dumps(message, separators=(",", ":")))


class ClientProxy:
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


def async_iter(iterable):
    return iterable.__aiter__()


async def async_next(it):
    return await async_iter(it).__anext__()
