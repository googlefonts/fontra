import asyncio
import json
import logging
import websockets


logger = logging.getLogger(__name__)


class Server:
    def __init__(self, subject):
        self.clients = {}
        self.subject = subject

    def run(self, host="localhost", port=8001):
        startServer = websockets.serve(self.incomingConnection, host, port)
        asyncio.get_event_loop().run_until_complete(startServer)
        asyncio.get_event_loop().run_forever()

    async def registerClient(self, client):
        self.clients[client.websocket] = client

    async def unregisterClient(self, client):
        del self.clients[client.websocket]

    async def incomingConnection(self, websocket, path):
        client = Client(websocket, self.subject)
        await self.registerClient(client)
        try:
            await client.handleConnection(path)
        finally:
            await self.unregisterClient(client)


class Client:
    def __init__(self, websocket, subject):
        self.websocket = websocket
        self.subject = subject

    async def handleConnection(self, path):
        logger.info(f"incoming connection: {path!r}")
        async for message in self.websocket:
            message = json.loads(message)
            if message.get("connection") == "close":
                logger.info("client requested connection close")
                break
            callID = "unknown-call-id"
            try:
                callID = message["call-id"]
                methodName = message["method-name"]
                arguments = message.get("arguments", [])
                kwArguments = message.get("keyword-arguments", {})
                methodHandler = getattr(self.subject, "remote_" + methodName)
                returnValue = await methodHandler(*arguments, **kwArguments)
                response = {"call-id": callID, "return-value": returnValue}
            except Exception as e:
                logger.error("uncaught exception: %r", e)
                response = {"call-id": callID, "exception": repr(e)}
            await self.sendMessage(response)

    async def sendMessage(self, message):
        await self.websocket.send(json.dumps(message))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    class Foo:
        async def remote_test(self, *arguments, **kwargs):
            print("remote_test!")
            print("args:", arguments, kwargs)
            return "return value"

    server = Server(Foo())
    server.run()
