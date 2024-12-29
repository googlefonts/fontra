import pathlib
import subprocess

repoDir = pathlib.Path(__file__).resolve().parent.parent
scriptPath = repoDir / "scripts" / "rebuild_glyph_data_csv.py"


def test_glyph_data_csv_needs_update():
    try:
        subprocess.run(f"python {scriptPath} --check", check=True, shell=True)
    except subprocess.CalledProcessError:
        assert 0, f"unicode-utils.js is stale, please run ./scripts/{scriptPath.name}"
