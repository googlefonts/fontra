# Fontra

- checkout the repo, cd into the root of the repo

- create a Python venv in the root of the repo:

    `python3 -m venv venv --prompt=fontra`

- activate venv:

    `source venv/bin/activate`

- install dependencies:

    `pip install --upgrade pip`

    `pip install -r requirements.txt`

    `pip install -e .`

- start the fontra server with a path to a folder containing fonts (.rcjk, .designspace or .ufo), using `--filesystem-root`:

    `fontra --filesystem-root /path/to/a/folder`

- or a start it with a robocjk server hostname, using `--rcjk-host`:

    `fontra --rcjk-host some-robocjk-server.some-domain.com`

- then navigate to:

    `http://localhost:8000/`

## Block diagram

```mermaid
flowchart
  browser[Web browser]---client[Fontra client .js .css .html<br>HTML5 Canvas]
  client-.network.-server[Fontra server .py<br>aiohttp/websockets]
  server---ds[.designspace .ufo backend]
  server---rcjk[.rcjk backend]
  server---rcjk_mysql[rcjk mysql backend]
  ds---fs[File system]
  rcjk---fs
  rcjk_mysql-.network.-rcjk_server[RoboCJK web API]
  rcjk_server---django[Django / MySQL]
  django---git[GitHub]
```
