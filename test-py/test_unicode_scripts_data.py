import pathlib
import subprocess

repoDir = pathlib.Path(__file__).resolve().parent.parent
scriptPath = repoDir / "scripts" / "rebuild_unicode_scripts_data.py"


def test_unicode_scripts_data_needs_update():
    try:
        subprocess.run(f"python {scriptPath} --check", check=True, shell=True)
    except subprocess.CalledProcessError:
        assert 0, f"unicode-scripts.js is stale, please run ./scripts/{scriptPath.name}"
