from contextlib import contextmanager
import logging
import secrets
from ..backends.rcjk_mysql import RCJKMySQLBackend
from ..backends.rcjk_client import HTTPError
from ..backends.rcjk_client_async import RCJKClientAsync
from .fonthandler import FontHandler


logger = logging.getLogger(__name__)


class RCJKProjectManagerFactory:
    @staticmethod
    def addArguments(parser):
        parser.add_argument("rcjk_host")

    @staticmethod
    def getProjectManager(arguments):
        return RCJKProjectManager(host=arguments.rcjk_host)


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
        logger.info(f"successfully logged in '{username}'")
        token = secrets.token_hex(32)
        self.authorizedClients[token] = AuthorizedClient(rcjkClient)
        return token

    async def projectAvailable(self, token, path):
        client = self.authorizedClients[token]
        return await client.projectAvailable(path)

    async def getRemoteSubject(self, path, token, remoteIP):
        client = self.authorizedClients.get(token)
        if client is None:
            logger.info("reject unrecognized token")
            return None
        if path == "/":
            return client

        assert path[0] == "/"
        path = path[1:]
        if not await client.projectAvailable(path):
            logger.info(f"path {path!r} not found or not authorized")
            return None  # not found or not authorized
        return await client.getFontHandler(path)


class AuthorizedClient:

    remoteMethodNames = {"getProjectList"}

    def __init__(self, rcjkClient):
        self.rcjkClient = rcjkClient
        self.projectMapping = None
        self.fontHandlers = {}

    @contextmanager
    def useConnection(self, connection):
        yield

    async def projectAvailable(self, path):
        await self._setupProjectList()
        return path in self.projectMapping

    async def getProjectList(self, *, connection):
        await self._setupProjectList()
        return sorted(self.projectMapping)

    async def _setupProjectList(self):
        if self.projectMapping is not None:
            return
        projectMapping = await self.rcjkClient.get_project_font_uid_mapping()
        projectMapping = {f"{p}/{f}": uids for (p, f), uids in projectMapping.items()}
        self.projectMapping = projectMapping

    async def getFontHandler(self, path):
        fontHandler = self.fontHandlers.get(path)
        if fontHandler is None:
            _, fontUID = self.projectMapping[path]
            backend = RCJKMySQLBackend.fromRCJKClient(self.rcjkClient, fontUID)
            fontHandler = FontHandler(backend)
            self.fontHandlers[path] = fontHandler
        return fontHandler
