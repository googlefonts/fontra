import asyncio


class async_property:
    def __init__(self, func):
        self.func = func

    def __get__(self, obj, objtype=None):
        return self.func(obj)


class async_cached_property:
    def __init__(self, func):
        self.func = func

    def __get__(self, obj, objtype=None):
        cachedFuture = getattr(obj, self.privateName, None)
        if cachedFuture is None:
            cachedFuture = asyncio.ensure_future(self.func(obj))
            setattr(obj, self.privateName, cachedFuture)
        return cachedFuture

    def __delete__(self, obj):
        if hasattr(obj, self.privateName):
            delattr(obj, self.privateName)

    def __set_name__(self, owner, name):
        self.name = name
        self.privateName = "__cachedAsyncProperty_" + name
