import aiohttp
from .rcjk_client import Client as RCJKClient, HTTPError


class RCJKClientAsync(RCJKClient):
    def _connect(self):
        # Override with no-op, as we need to handle the connection separately
        # as an async method.
        pass

    async def connect(self):
        self._session = aiohttp.ClientSession(
            connector=aiohttp.TCPConnector(verify_ssl=False)
        )
        session = await self._session.__aenter__()
        assert session is self._session

        try:
            # check if there are robocjk apis available at the given host
            response = await self._api_call("ping")
            assert response["data"] == "pong"
        except Exception as e:
            # invalid host
            raise ValueError(
                f"Unable to call RoboCJK APIs at host: {self._host} - Exception: {e}"
            )

        # obtain the auth token to prevent 401 error on first call
        await self.auth_token()

    async def close(self):
        await self._session.__aexit__(None, None, None)

    async def get_project_font_uid_mapping(self):
        project_font_uid_mapping = {}
        for project_item in (await self.project_list())["data"]:
            project_name = project_item["name"]
            project_uid = project_item["uid"]
            for font_item in (await self.font_list(project_uid))["data"]:
                font_name = font_item["name"]
                font_uid = font_item["uid"]
                project_font_uid_mapping[project_name, font_name] = (
                    project_uid,
                    font_uid,
                )
        return project_font_uid_mapping

    async def _api_call(self, view_name, params=None):
        url, data, headers = self._prepare_request(view_name, params)
        async with self._session.post(url, data=data, headers=headers) as response:
            if response.status == 401:
                # unauthorized - request a new auth token
                await self.auth_token()
                if self._auth_token:
                    # re-send previously unauthorized request
                    return await self._api_call(view_name, params)
            # read response json data and return dict
            response_data = await response.json()
            if response.status != 200:
                raise HTTPError(f"{response.status} {response_data['error']}")
        return response_data

    async def auth_token(self):
        """
        Get an authorization token for the current user.
        """
        params = {
            "username": self._username,
            "password": self._password,
        }
        response = await self._api_call("auth_token", params)
        # update auth token
        self._auth_token = response.get("data", {}).get("auth_token", self._auth_token)
        return response
