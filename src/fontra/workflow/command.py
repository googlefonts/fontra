import argparse
import asyncio
import json
import logging
import pathlib
import sys
from contextlib import AsyncExitStack

import yaml

from .actions import actionLogger
from .workflow import Workflow

if hasattr(logging, "getLevelNamesMapping"):
    levelNamesMapping = logging.getLevelNamesMapping()
else:
    # Python < 3.11
    levelNamesMapping = {
        "CRITICAL": 50,
        "FATAL": 50,
        "ERROR": 40,
        "WARN": 30,
        "WARNING": 30,
        "INFO": 20,
        "DEBUG": 10,
        "NOTSET": 0,
    }

sortedlevelNames = [
    name for name, value in sorted(levelNamesMapping.items(), key=lambda item: item[1])
]


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
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-dir",
        type=existing_folder,
        default=pathlib.Path(),
        help="A path to a folder for the output",
    )
    parser.add_argument(
        "--logging-level",
        choices=sortedlevelNames,
        default="WARNING",
        help="The logging level for stdout output",
    )
    parser.add_argument(
        "--actions-log-file",
        type=argparse.FileType("w"),
        help="A path for a log file that captures actions log activity",
    )
    parser.add_argument(
        "--actions-log-file-logging-level",
        choices=sortedlevelNames,
        default="WARNING",
        help="The logging level for the actions log file",
    )
    parser.add_argument(
        "config",
        nargs="+",
        type=yaml_or_json,
        help="One or more YAML or JSON file providing configuration. "
        "When multiple configuration files are given, they will be chained.",
    )

    args = parser.parse_args()

    rootLogger = logging.getLogger()
    rootLogger.setLevel(logging.NOTSET)
    stdoutHandler = logging.StreamHandler(sys.stdout)
    stdoutHandler.setLevel(levelNamesMapping[args.logging_level])
    stdoutHandler.setFormatter(
        logging.Formatter(
            "%(asctime)s %(name)-17s %(levelname)-8s %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    rootLogger.addHandler(stdoutHandler)

    if args.actions_log_file is not None:
        logHandler = logging.StreamHandler(args.actions_log_file)
        logHandler.setLevel(levelNamesMapping[args.actions_log_file_logging_level])
        logHandler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)-8s %(message)s", datefmt="%Y-%m-%d %H:%M:%S"
            )
        )
        actionLogger.addHandler(logHandler)

    output_dir = args.output_dir

    nextInput = None

    async with AsyncExitStack() as exitStack:
        outputs = []
        for config, config_path in args.config:
            workflow = Workflow(config=config, parentDir=config_path.parent)
            endPoints = await exitStack.enter_async_context(
                workflow.endPoints(nextInput)
            )
            outputs.extend(endPoints.outputs)
            nextInput = endPoints.endPoint

        for output in outputs:
            await output.process(output_dir)


def main():
    asyncio.run(mainAsync())


if __name__ == "__main__":
    main()
