class LRUCache(dict):
    """A quick and dirty Least Recently Used cache, which leverages the fact
    that dictionaries keep their insertion order.
    """

    def __init__(self, maxSize=128):
        assert isinstance(maxSize, int)
        assert maxSize > 0
        self._maxSize = maxSize

    def get(self, key, default=None):
        # Override so we get our custom __getitem__ behavior
        try:
            value = self[key]
        except KeyError:
            value = default
        return value

    def __getitem__(self, key):
        value = super().__getitem__(key)
        # Move key/value to the end
        del self[key]
        self[key] = value
        return value

    def __setitem__(self, key, value):
        if key in self:
            # Ensure key/value get inserted at the end
            del self[key]
        super().__setitem__(key, value)
        while len(self) > self._maxSize:
            del self[next(iter(self))]
