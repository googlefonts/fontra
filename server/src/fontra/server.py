import asyncio
import json
import logging
import websockets


logger = logging.getLogger(__name__)


class Server:
    def __init__(self, subject, methodNames):
        self.clients = {}
        self.subject = subject
        self.methodNames = set(methodNames)

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
        client = Client(websocket, self.subject, self.methodNames)
        self.registerClient(client)
        try:
            await client.handleConnection(path)
        finally:
            self.unregisterClient(client)


class Client:
    def __init__(self, websocket, subject, methodNames):
        self.websocket = websocket
        self.subject = subject
        self.methodNames = methodNames

    async def handleConnection(self, path):
        logger.info(f"incoming connection: {path!r}")
        tasks = []
        async for message in self.websocket:
            message = json.loads(message)
            if message.get("connection") == "close":
                logger.info("client requested connection close")
                break
            tasks = [task for task in tasks if not task.done()]
            tasks.append(asyncio.create_task(self._performCall(message)))

    async def _performCall(self, message):
        callID = "unknown-call-id"
        try:
            callID = message["call-id"]
            methodName = message["method-name"]
            arguments = message.get("arguments", [])
            kwArguments = message.get("keyword-arguments", {})
            if methodName in self.methodNames:
                methodHandler = getattr(self.subject, methodName)
                returnValue = await methodHandler(*arguments, **kwArguments)
                response = {"call-id": callID, "return-value": returnValue}
            else:
                response = {
                    "call-id": callID,
                    "exception": f"unknown method {methodName}",
                }
        except Exception as e:
            logger.error("uncaught exception: %r", e)
            response = {"call-id": callID, "exception": repr(e)}
        await self.sendMessage(response)

    async def sendMessage(self, message):
        await self.websocket.send(json.dumps(message, separators=(",", ":")))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    class Foo:
        async def remote_test(self, *arguments, **kwargs):
            print("remote_test!")
            print("args:", arguments, kwargs)
            return "return value"

    server = Server(Foo())
    server.run()
