from urllib.parse import urlsplit, urlunsplit


async def getMySQLBackend(url):
    from .backends.rcjkmysql import RCJKMySQLBackend

    parsed = urlsplit(url)
    displayURL = urlunsplit([parsed.scheme, parsed.hostname, parsed.path, None, None])
    print(f"connecting to project {displayURL}...")
    return await RCJKMySQLBackend.fromURL(url)


class RCJKProjectManager:

    requireLogin = True

    def __init__(self, host):
        self.host = host
        self.rcjkClients = {}

    async def login(self, username, password):
        return token

    async def getRemoteSubject(self, path, token, remoteIP):
        if path == "/":
            return AuthorizedProjectManager(...)
        ...


class AuthorizedProjectManager:

    remoteMethodNames = {"getProjectList"}

    def __init__(self, rcjkClient):
        ...

    def projectExists(self, *pathItems):
        ...

    async def getProjectList(self, *, client):
        ...
