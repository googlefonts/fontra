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

- start the fontra server with a path to an .rcjk or a .designspace project:

    `fontra /path/to/a/project.rcjk`

- or a URL to a RoboCJK MySQL server of this form:

    `fontra https://<user>:<passw>@<domain>/<project>/<font>`

- navigate to

    `http://localhost:8000/`

- Block diagram:

```

                                     [ UI (web browser) ]
                                              |
                                    [ fontra client (js) ]
                                              |
                                       (local network)
                                              |
                           [ fontra server (http + websocket, py) ]
                                              |
                                             /|\
                   -------------------------- | -------------------------
                  /                           |                          \
                 /                            |                           \
                |                             |                            |
    [ fontra rcjkmysql backend ]   [ fontra rcjk backend ]   [ fontra designspace backend ]
                |                             |                            |
       [ robocjk.api.client ]           [ rcjktools ]              [ designspaceLib ]
                |                       [  ufoLib   ]              [    ufoLib      ]
            (network)                   [ fontTools ]              [   fontTools    ]
                |                             |                            |
          [ HTTP server ]                      \                          /
                |                               \                        /
           [ web API ]                           ---------   ------------
                |                                         \ /
             [ ORM ]                                       |
                |                                          |
    [ rcjk DB storage (MySQL) ]                     [ file system ]
                |
         [ file system ]
                |
             [ git ]
                |
            [ github ]

```