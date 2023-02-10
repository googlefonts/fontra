//
// A general Cached Representation mechanism
//

export function registerRepresentationFactory(classObject, representationKey, func) {
  let factories = classObject._representationFactories;
  if (!factories) {
    factories = {};
    classObject._representationFactories = factories;
  }
  factories[representationKey] = func;
}

export function getRepresentation(obj, representationKey) {
  let representation = obj._representationCache?.[representationKey];
  if (representation === undefined) {
    if (!obj._representationCache) {
      obj._representationCache = {};
    }
    const classObject = obj.constructor;
    const factory = classObject._representationFactories[representationKey];
    if (!factory) {
      throw new Error(`Can't find representation factory for '${representationKey}'`);
    }
    representation = factory(obj);
    obj._representationCache[representationKey] = representation;
  }
  return representation;
}

export function clearRepresentationCache(obj) {
  obj._representationCache = {};
}
