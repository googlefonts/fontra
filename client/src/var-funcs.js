import { VariationError } from "./errors.js"


function addItemwise(a, b) {
  if (typeof a === "string") {
    if (a !== b) {
      throw new VariationError(`unexpected different strings: ${a} != ${b}`);
    }
    return a;
  } else if (!isNaN(a)) {
    return a + b;
  } else if (a.addItemwise !== undefined) {
    return a.addItemwise(b);
  }
  return itemwiseFunc(a, b, addItemwise);
}


function subItemwise(a, b) {
  if (typeof a === "string") {
    if (a !== b) {
      throw new VariationError(`unexpected different strings: ${a} != ${b}`);
    }
    return a;
  } else if (!isNaN(a)) {
    return a - b;
  } else if (a.subItemwise !== undefined) {
    return a.subItemwise(b);
  }
  return itemwiseFunc(a, b, subItemwise);
}


function mulScalar(o, scalar) {
  if (typeof o === "string") {
    return o;
  } else if (!isNaN(o)) {
    return o * scalar;
  } else if (o.mulScalar !== undefined) {
    return o.mulScalar(scalar);
  }
  return mapFunc(o, item => mulScalar(item, scalar));
}


function itemwiseFunc(a, b, func) {
  var result;
  if (a.length !== undefined) {
    result = a.constructor(a.length);
    if (a.length != b.length) {
      throw new VariationError(`arrays have incompatible lengths: ${a.length} != ${b.length}`);
    }
    for (let i = 0; i < a.length; i++) {
      result[i] = func(a[i], b[i]);
    }
  } else {
    result = a.constructor();
    const keys = Object.keys(a);
    if (keys.length != Object.keys(b).length) {
      throw new VariationError(`objects have incompatible number of entries: ${keys.length} != ${Object.keys(b).length}`);
    }
    for (let key of keys) {
      const valueB = b[key];
      if (valueB === undefined) {
        throw new VariationError(`objects have incompatible key sets: ${keys} != ${Object.keys(b)}`);
      }
      result[key] = func(a[key], valueB);
    }
  }
  return result;
}


function mapFunc(o, func) {
  var result;
  if (o.map !== undefined) {
    return o.map(func);
  } else {
    result = o.constructor();
    const keys = Object.keys(o);
    for (let key of keys) {
      result[key] = func(o[key]);
    }
  }
  return result;
}

export { addItemwise, subItemwise, mulScalar };
