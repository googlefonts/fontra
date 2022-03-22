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
        self.rcjkClients = {}

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
            return None
        token = secrets.token_hex(32)
        self.rcjkClients[token] = rcjkClient
        return token

    async def getRemoteSubject(self, path, token, remoteIP):
        client = self.rcjkClients[token]
        if path == "/":
            return AuthorizedProjectManager(client)
        ...


class AuthorizedProjectManager:

    remoteMethodNames = {"getProjectList"}

    def __init__(self, rcjkClient):
        ...

    def projectExists(self, *pathItems):
        ...

    async def getProjectList(self, *, client):
        return ["/testing/fooo"]
