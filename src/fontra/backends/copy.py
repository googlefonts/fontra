import argparse
import asyncio
import logging
import pathlib
import shutil
from contextlib import closing

from . import getFileSystemBackend, newFileSystemBackend

logger = logging.getLogger(__name__)


async def copyFont(
    sourceBackend, destBackend, *, glyphNames=None, numTasks=1, progressInterval=0
):
    await destBackend.putGlobalAxes(await sourceBackend.getGlobalAxes())
    await destBackend.putCustomData(await sourceBackend.getCustomData())
    glyphMap = await sourceBackend.getGlyphMap()
    glyphNamesInFont = set(glyphMap)
    glyphNamesToCopy = sorted(
        glyphNamesInFont if not glyphNames else set(glyphNames) & set(glyphMap)
    )
    glyphNamesCopied = set()

    tasks = [
        asyncio.create_task(
            copyGlyphs(
                sourceBackend,
                destBackend,
                glyphMap,
                glyphNamesToCopy,
                glyphNamesCopied,
                progressInterval,
            )
        )
        for i in range(numTasks)
    ]
    done, pending = await asyncio.wait(tasks, return_when=asyncio.FIRST_EXCEPTION)
    for task in pending:
        task.cancel()
    exceptions = [task.exception() for task in done if task.exception()]
    if exceptions:
        if len(exceptions) > 1:
            logger.error(f"Multiple exceptions were raised: {exceptions}")
        raise exceptions[0]


async def copyGlyphs(
    sourceBackend,
    destBackend,
    glyphMap,
    glyphNamesToCopy,
    glyphNamesCopied,
    progressInterval,
):
    while glyphNamesToCopy:
        if progressInterval and not (len(glyphNamesToCopy) % progressInterval):
            logger.info(f"{len(glyphNamesToCopy)} glyphs left to copy")
        glyphName = glyphNamesToCopy.pop(0)
        glyphNamesCopied.update(glyphNamesToCopy)
        logger.debug(f"reading {glyphName}")
        glyph = await sourceBackend.getGlyph(glyphName)
        if glyph is None:
            logger.warn(f"glyph {glyphName} not found")
            continue

        logger.debug(f"writing {glyphName}")

        componentNames = {
            compo.name
            for layer in glyph.layers.values()
            for compo in layer.glyph.components
        }
        glyphNamesToCopy.extend(sorted(componentNames - glyphNamesCopied))

        error = await destBackend.putGlyph(glyphName, glyph, glyphMap[glyphName])
        if error:
            # FIXME: putGlyph should always raise, and not return some error string
            # This may be unique to the rcjk backend, though.
            raise ValueError(error)


async def mainAsync():
    logging.basicConfig(
        format="%(asctime)s %(name)-17s %(levelname)-8s %(message)s",
        level=logging.INFO,
        datefmt="%Y-%m-%d %H:%M:%S",
    )
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("destination")
    parser.add_argument("--overwrite", type=bool, default=False)
    parser.add_argument(
        "--glyphs", help="A comma- or space-separated list of glyph names", default=""
    )
    parser.add_argument(
        "--glyphs-file",
        type=argparse.FileType("r"),
        help="A file containing a space-separated list glyph names",
    )
    parser.add_argument("--progress-interval", type=int, default=0)
    parser.add_argument("--num-tasks", type=int, default=1)

    args = parser.parse_args()

    glyphNames = [
        glyphName for part in args.glyphs.split(",") for glyphName in part.split()
    ]
    if args.glyphs_file is not None:
        glyphNames.extend(args.glyphs_file.read().split())

    sourcePath = pathlib.Path(args.source)
    assert sourcePath.exists()
    destPath = pathlib.Path(args.destination)
    if args:
        if destPath.is_dir():
            shutil.rmtree(destPath)
        elif destPath.exists():
            destPath.unlink()
    elif destPath.exists():
        raise argparse.ArgumentError("the destination file already exists")

    sourceBackend = getFileSystemBackend(sourcePath)
    destBackend = newFileSystemBackend(destPath)

    # TODO: determine numTasks based on whether either backend supports parallelism

    with closing(sourceBackend), closing(destBackend):
        await copyFont(
            sourceBackend,
            destBackend,
            glyphNames=glyphNames,
            numTasks=args.num_tasks,
            progressInterval=args.progress_interval,
        )


def main():
    asyncio.run(mainAsync())


if __name__ == "__main__":
    main()
