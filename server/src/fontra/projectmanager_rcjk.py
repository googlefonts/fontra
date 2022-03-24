from contextlib import contextmanager
import logging
import secrets
from .backends.rcjkmysql import RCJKMySQLBackend
from .backends.rcjkclient import HTTPError
from .backends.rcjkclient_async import RCJKClientAsync
from .fonthandler import FontHandler


logger = logging.getLogger(__name__)


class RCJKProjectManager:

    requireLogin = True

    def __init__(self, host):
        self.host = host
        self.authorizedClients = {}

    async def close(self):
        for client in self.authorizedClients.values():
            await client.rcjkClient.close()

    async def login(self, username, password):
        url = f"https://{self.host}/"
        rcjkClient = RCJKClientAsync(
            host=url,
            username=username,
            password=password,
        )
        try:
            await rcjkClient.connect()
        except HTTPError:
            logger.info(f"failed to log in '{username}'")
            await rcjkClient.close()
            return None
        token = secrets.token_hex(32)
        self.authorizedClients[token] = AuthorizedClient(rcjkClient)
        return token

    def projectExists(self, token, path):
        client = self.authorizedClients[token]
        return client.projectExists(path)

    async def getRemoteSubject(self, path, token, remoteIP):
        client = self.authorizedClients[token]
        if path == "/":
            return client

        assert path[0] == "/"
        path = path[1:]
        return await client.getFontHandler(path)


class AuthorizedClient:

    remoteMethodNames = {"getProjectList"}

    def __init__(self, rcjkClient):
        self.rcjkClient = rcjkClient
        self.projectMapping = {}
        self.fontHandlers = {}

    @contextmanager
    def useConnection(self, connection):
        yield

    def projectExists(self, path):
        return path in self.projectMapping

    async def getProjectList(self, *, connection):
        projectMapping = await self.rcjkClient.get_project_font_uid_mapping()
        projectMapping = {f"{p}/{f}": uids for (p, f), uids in projectMapping.items()}
        self.projectMapping = projectMapping
        return sorted(projectMapping)

    async def getFontHandler(self, path):
        fontHandler = self.fontHandlers.get(path)
        if fontHandler is None:
            _, fontUID = self.projectMapping[path]
            backend = await RCJKMySQLBackend.fromRCJKClient(self.rcjkClient, fontUID)
            fontHandler = FontHandler(backend)
            self.fontHandlers[path] = fontHandler
        return fontHandler
