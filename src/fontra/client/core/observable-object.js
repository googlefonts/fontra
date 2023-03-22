export function newObservableObject(obj) {
  if (!obj) {
    obj = {};
  }
  const eventListeners = { changed: [], deleted: [] };

  function dispatchEvent(type, key, value) {
    const event = {
      type: type,
      target: obj,
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
      if (!eventListeners[type]) {
        throw new Error(
          `event type must be one of ${Object.keys(eventListeners).join(
            ","
          )}, got ${type} instead`
        );
      }
      eventListeners[type].push(listener);
    },
    removeEventListener(type, listener) {
      if (!eventListeners[type]) {
        throw new Error(
          `event type must be one of ${Object.keys(eventListeners).join(
            ","
          )}, got ${type} instead`
        );
      }
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
      delete obj[prop];
      dispatchEvent("deleted", prop);
      return true;
    },
  };

  return new Proxy(obj, handler);
}
