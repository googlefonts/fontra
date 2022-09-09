# Fontra

![Fontra Icon](https://github.com/BlackFoundryCom/fontra/blob/main/src/fontra/client/images/fontra-icon.svg?raw=true)

Fontra is an in-development browser-based Font editor. It consists of two main parts:

- Fontra client — runs in the browser, written in JavaScript
- Fontra server — runs locally or on a remote server, written in Python

## Installing Fontra

- Check out the repo, cd into the root of the repo

- Create a Python venv in the root of the repo:

    `python3 -m venv venv --prompt=fontra`

- Activate venv:

    `source venv/bin/activate`

- Install dependencies:

    `pip install --upgrade pip`

    `pip install -r requirements.txt`

    `pip install -e .`

- Start the fontra server with a path to a folder containing fonts (.designspace, .ufo, .ttf or .otf), using the `filesystem` subcommand:

    `fontra filesystem /path/to/a/folder`

- Then navigate to:

    `http://localhost:8000/`

- To use Fontra with .rcjk data on disk, or to connect to a remote rcjk server, install the [`fontra-rcjk`](https://github.com/BlackFoundryCom/fontra-rcjk) plugin package. Then you can start it with a robocjk server hostname, using the `rcjk` subcommand provided by the `fontra-rcjk` plugin:

    `fontra rcjk some-robocjk-server.some-domain.com`
