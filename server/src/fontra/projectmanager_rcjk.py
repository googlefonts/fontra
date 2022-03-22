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
        self.clients = {}  # TODO: is this the right thing?
        self.authorizedClients = {}

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

    def projectExists(self, token, *pathItems):
        client = self.authorizedClients[token]
        return client.projectExists(*pathItems)

    async def getRemoteSubject(self, path, token, remoteIP):
        client = self.authorizedClients[token]
        if path == "/":
            return client

        pathItems = tuple(path.split("/"))
        assert pathItems[0] == ""
        pathItems = pathItems[1:]
        assert len(pathItems) == 2
        _, fontUID = client.projectMapping[pathItems]
        backend = await RCJKMySQLBackend.fromRCJKClient(client.rcjkClient, fontUID)
        return FontHandler(backend, self.clients)


class AuthorizedClient:

    remoteMethodNames = {"getProjectList"}

    def __init__(self, rcjkClient):
        self.rcjkClient = rcjkClient
        self.projectMapping = {}

    def projectExists(self, *pathItems):
        return pathItems in self.projectMapping

    async def getProjectList(self, *, client):
        projectMapping = await self.rcjkClient.get_project_font_uid_mapping()
        projectList = [f"{p}/{f}" for p, f in projectMapping.keys()]
        self.projectMapping = projectMapping
        return sorted(projectList)
