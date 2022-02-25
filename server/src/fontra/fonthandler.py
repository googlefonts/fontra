import asyncio


class FontHandler:
    def __init__(self, backend, clients):
        self.backend = backend
        self.clients = clients
        self.remoteMethodNames = {
            "changeBegin",
            "changeSetRollback",
            "changeChanging",
            "changeEnd",
            "getGlyph",
            "getGlyphNames",
            "getReverseCmap",
            "getGlobalAxes",
        }

    async def getGlyph(self, glyphName, *, client):
        return await self.backend.getGlyph(glyphName)

    async def getGlyphNames(self, *, client):
        return await self.backend.getGlyphNames()

    async def getReverseCmap(self, *, client):
        return await self.backend.getReverseCmap()

    async def getGlobalAxes(self, *, client):
        return await self.backend.getGlobalAxes()

    async def changeBegin(self, *, client):
        # await self.broadcastMessage("hello world", client)
        # deadlock avoidance:
        task = asyncio.create_task(self.broadcastMessage("hello world", client))

    async def changeSetRollback(self, rollbackChange, *, client):
        ...

    async def changeChanging(self, change, *, client):
        ...

    async def changeEnd(self, *, client):
        ...

    async def broadcastMessage(self, arg, excludeClient):
        for client in self.clients.values():
            if client != excludeClient:
                print("before")
                result = await client.proxy.testCall(arg)
                print(result)
