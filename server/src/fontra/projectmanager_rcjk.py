import logging
import secrets
from .backends.rcjkmysql import RCJKClientAsync, RCJKMySQLBackend
from .backends.rcjkclient import HTTPError


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
        ...


class AuthorizedClient:

    remoteMethodNames = {"getProjectList"}

    def __init__(self, rcjkClient):
        self.cachedProjectPaths = set()

    def projectExists(self, *pathItems):
        path = "/".join(pathItems)
        return path in self.cachedProjectPaths

    async def getProjectList(self, *, client):
        projectList = ["testing/fooo"]
        self.cachedProjectPaths = projectList
        return projectList
