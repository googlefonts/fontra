export function memoize(func) {
  const cache = new Map();
  return async (...args) => {
    const cacheKey = JSON.stringify(args);
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    const promise = func(...args);
    cache.set(cacheKey, promise);
    return promise;
  };
}
