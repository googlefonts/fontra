from fontra.core.lrucache import LRUCache


def test_lruCache():
    cache = LRUCache(4)
    cache["a"] = None
    assert ["a"] == list(cache.keys())
    cache["b"] = None
    assert ["a", "b"] == list(cache.keys())
    _ = cache["a"]
    assert ["b", "a"] == list(cache.keys())
    cache["c"] = None
    cache["d"] = None
    assert ["b", "a", "c", "d"] == list(cache.keys())
    _ = cache["c"]
    assert ["b", "a", "d", "c"] == list(cache.keys())
    cache["e"] = None
    assert ["a", "d", "c", "e"] == list(cache.keys())
    _ = cache["a"]
    cache["f"] = None
    assert ["c", "e", "a", "f"] == list(cache.keys())
