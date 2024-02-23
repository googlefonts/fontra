import argparse
import asyncio
import json
import logging
import os
import pathlib

import yaml

from .pipeline import Pipeline


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
    logging.basicConfig(
        format="%(asctime)s %(name)-17s %(levelname)-8s %(message)s",
        level=logging.INFO,
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-dir", type=existing_folder)
    parser.add_argument(
        "config", type=yaml_or_json, help="A YAML or JSON file providing configuration"
    )

    args = parser.parse_args()

    config, config_path = args.config
    output_dir = args.output_dir

    os.chdir(config_path.parent)

    pipeline = Pipeline(config=config)
    outputs = await pipeline.setupOutputs()

    for output in outputs:
        await output.process(output_dir)


def main():
    asyncio.run(mainAsync())


if __name__ == "__main__":
    main()
