# Fontra

- checkout the repo, cd into the root of the repo

- create a Python venv in the root of the repo:

    `python3 -m venv venv --prompt=fontra`

- activate venv:

    source venv/bin/activate

- install dependencies:

    pip install --upgrade pip
    pip install -r requirements.txt
    pip install -e .

- start the fontra server with a path to an .rcjk project:

    fontra /path/to/a/project.rcjk

- navigate to

    http://localhost:8000/html/fontra.html
