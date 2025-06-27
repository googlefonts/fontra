import asyncio
import atexit
import concurrent.futures

_threadPool = None


async def runInThread(func, *args):
    global _threadPool

    if _threadPool is None:
        _threadPool = concurrent.futures.ThreadPoolExecutor()

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_threadPool, func, *args)


def shutdownThreadPool():
    global _threadPool

    if _threadPool is not None:
        _threadPool.shutdown()
        _threadPool = None


atexit.register(shutdownThreadPool)
