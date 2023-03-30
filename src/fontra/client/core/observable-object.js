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
    addEventListener(receiver, type, listener) {
      if (!eventListeners[type]) {
        throw new Error(
          `event type must be one of ${Object.keys(eventListeners).join(
            ","
          )}, got ${type} instead`
        );
      }
      eventListeners[type].push(listener);
    },

    removeEventListener(receiver, type, listener) {
      if (!eventListeners[type]) {
        throw new Error(
          `event type must be one of ${Object.keys(eventListeners).join(
            ","
          )}, got ${type} instead`
        );
      }
      eventListeners[type] = eventListeners[type].filter((item) => item !== listener);
    },

    synchronizeWithLocalStorage(receiver, prefix = "") {
      synchronizeWithLocalStorage(receiver, prefix);
    },
  };

  const handler = {
    set(obj, prop, value) {
      if (obj[prop] !== value) {
        obj[prop] = value;
        dispatchEvent("changed", prop, value);
      }
      return true;
    },

    get(obj, prop, receiver) {
      const method = methods[prop];
      if (method) {
        return method.bind(null, receiver);
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

function synchronizeWithLocalStorage(obj, prefix = "") {
  const toObject = {};
  const toStorage = {};
  const stringKeys = {};
  for (const [key, value] of Object.entries(obj)) {
    const storageKey = prefix + key;
    toObject[storageKey] = key;
    toStorage[key] = storageKey;
    stringKeys[key] = typeof value === "string";
    const storedValue = localStorage.getItem(storageKey);
    if (storedValue !== null) {
      setItemOnObject(key, storedValue);
    }
  }

  function setItemOnObject(key, value) {
    if (!stringKeys[key]) {
      value = JSON.parse(value);
    }
    obj[key] = value;
  }

  function setItemOnStorage(key, value) {
    if (!stringKeys[key]) {
      value = JSON.stringify(value);
    }
    const storageKey = toStorage[key];
    if (localStorage.getItem(storageKey) !== value) {
      localStorage.setItem(storageKey, value);
    }
  }

  obj.addEventListener("changed", (event) => {
    if (event.key in toStorage) {
      setItemOnStorage(event.key, event.value);
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key in toObject) {
      setItemOnObject(toObject[event.key], event.newValue);
    }
  });
}
