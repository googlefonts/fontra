import argparse
import asyncio
import json
import logging
import os
import pathlib

import yaml

from .actions import actionLogger
from .workflow import Workflow


def yaml_or_json(path):
    path = pathlib.Path(path)
    if not path.is_file():
        raise argparse.ArgumentError(f"File not found: {path!r}")
    path = path.resolve()
    contents = path.read_text(encoding="utf-8")
    if path.suffix == ".json":
        return json.loads(contents), path
    else:
        return yaml.safe_load(contents), path


def existing_folder(path):
    path = pathlib.Path(path)
    if not path.is_dir():
        raise argparse.ArgumentError(f"Folder not found: {path!r}")
    path = path.resolve()
    return path


async def mainAsync():
    loggingLevelNames = logging.getLevelNamesMapping()
    levelNames = [
        name
        for name, value in sorted(loggingLevelNames.items(), key=lambda item: item[1])
    ]

    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-dir", type=existing_folder, help="A path to a folder for the output"
    )
    parser.add_argument("--logging-level", choices=levelNames, default="WARNING")
    parser.add_argument(
        "--log-file", type=argparse.FileType("w"), help="A path for a log file"
    )
    parser.add_argument(
        "config", type=yaml_or_json, help="A YAML or JSON file providing configuration"
    )

    args = parser.parse_args()

    logging.basicConfig(
        format="%(asctime)s %(name)-17s %(levelname)-8s %(message)s",
        level=loggingLevelNames[args.logging_level],
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    config, config_path = args.config
    output_dir = args.output_dir

    if args.log_file is not None:
        logHandler = logging.StreamHandler(args.log_file)
        logHandler.setLevel(logging.WARNING)
        logHandler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)-8s %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
            )
        )
        actionLogger.addHandler(logHandler)

    os.chdir(config_path.parent)

    workflow = Workflow(config=config)
    async with workflow.endPoints() as endPoints:
        for output in endPoints.outputs:
            await output.process(output_dir)


def main():
    asyncio.run(mainAsync())


if __name__ == "__main__":
    main()
