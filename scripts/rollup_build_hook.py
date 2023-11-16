import pathlib
import shutil
import subprocess

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class RollupBuildHook(BuildHookInterface):
    def initialize(self, version, build_data):
        path = (
            pathlib.Path(__file__).resolve().parent.parent
            / "src"
            / "fontra"
            / "client"
            / "third-party"
        )
        if path.exists():
            shutil.rmtree(path.resolve())
        subprocess.check_output("npm install", shell=True)
        subprocess.check_output("npm run bundle-rollup", shell=True)
