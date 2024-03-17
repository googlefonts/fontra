import asyncio
import atexit
import concurrent.futures

_processPool = None


async def runInProcess(func):
    global _processPool

    if _processPool is None:
        _processPool = concurrent.futures.ProcessPoolExecutor()

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_processPool, func)


def _shutdownProcessPool():
    if _processPool is not None:
        _processPool.shutdown()


atexit.register(_shutdownProcessPool)
