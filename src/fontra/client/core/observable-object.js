export function newObservableObject(obj) {
  if (!obj) {
    obj = {};
  }
  const eventListeners = { changed: [], deleted: [] };

  function dispatchEvent(type, key, value) {
    const event = {
      type: type,
      key: key,
      value: value,
    };
    for (const listener of eventListeners[type]) {
      // Schedule in the event loop rather than call immediately
      setTimeout(() => listener(event), 0);
    }
  }

  const methods = {
    addEventListener(type, listener) {
      eventListeners[type].push(listener);
    },
    removeEventListener(type, listener) {
      eventListeners[type] = eventListeners[type].filter((item) => item !== listener);
    },
  };

  const handler = {
    set(obj, prop, value) {
      obj[prop] = value;
      dispatchEvent("changed", prop, value);
      return true;
    },

    get(obj, prop) {
      const method = methods[prop];
      if (method) {
        return method;
      }
      return obj[prop];
    },

    deleteProperty(obj, prop) {
      delete object[prop];
      dispatchEvent("deleted", prop);
      return true;
    },
  };

  return new Proxy(obj, handler);
}
