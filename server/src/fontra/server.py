import asyncio
import json
import logging
import traceback
import websockets


logger = logging.getLogger(__name__)


class Server:
    def __init__(self, subject, methodNames, *, clients=None, verboseErrors=False):
        self.clients = clients if clients is not None else {}
        self.subject = subject
        self.methodNames = set(methodNames)
        self.verboseErrors = verboseErrors

    def getServerTask(self, host="localhost", port=8001):
        return websockets.serve(self.incomingConnection, host, port)

    def run(self, host="localhost", port=8001):
        startServer = self.getServerTask()
        asyncio.get_event_loop().run_until_complete(startServer)
        asyncio.get_event_loop().run_forever()

    def registerClient(self, client):
        self.clients[client.websocket] = client

    def unregisterClient(self, client):
        del self.clients[client.websocket]

    async def incomingConnection(self, websocket, path):
        client = Client(websocket, self.subject, self.methodNames, self.verboseErrors)
        self.registerClient(client)
        try:
            await client.handleConnection(path)
        finally:
            self.unregisterClient(client)


class Client:
    def __init__(self, websocket, subject, methodNames, verboseErrors):
        self.websocket = websocket
        self.subject = subject
        self.methodNames = methodNames
        self.verboseErrors = verboseErrors

    async def handleConnection(self, path):
        logger.info(f"incoming connection: {path!r}")
        tasks = []
        try:
            async for message in self.websocket:
                message = json.loads(message)
                if message.get("connection") == "close":
                    logger.info("client requested connection close")
                    break
                tasks = [task for task in tasks if not task.done()]
                tasks.append(asyncio.create_task(self._performCall(message)))
        except websockets.exceptions.ConnectionClosedError as e:
            logger.info(f"websocket connection closed: {e!r}")

    async def _performCall(self, message):
        callID = "unknown-call-id"
        try:
            callID = message["call-id"]
            methodName = message["method-name"]
            arguments = message.get("arguments", [])
            if methodName in self.methodNames:
                methodHandler = getattr(self.subject, methodName)
                returnValue = await methodHandler(*arguments, client=self)
                response = {"call-id": callID, "return-value": returnValue}
            else:
                response = {
                    "call-id": callID,
                    "exception": f"unknown method {methodName}",
                }
        except Exception as e:
            logger.error("uncaught exception: %r", e)
            if self.verboseErrors:
                traceback.print_exc()
            response = {"call-id": callID, "exception": repr(e)}
        await self.sendMessage(response)

    async def sendMessage(self, message):
        await self.websocket.send(json.dumps(message, separators=(",", ":")))
