import { VariationError } from "./errors.js"


function addItemwise(a, b) {
  if (!isNaN(a) && typeof a !== "string") {
    return a + b;
  } else if (a.addItemwise !== undefined) {
    return a.addItemwise(b);
  } else if (typeof a === "string") {
    if (a !== b) {
      throw new VariationError(`unexpected different strings: ${a} != ${b}`);
    }
    return a;
  }
  return itemwiseFunc(a, b, addItemwise);
}


function subItemwise(a, b) {
  if (!isNaN(a) && typeof a !== "string") {
    return a - b;
  } else if (a.subItemwise !== undefined) {
    return a.subItemwise(b);
  } else if (typeof a === "string") {
    if (a !== b) {
      throw new VariationError(`unexpected different strings: ${a} != ${b}`);
    }
    return a;
  }
  return itemwiseFunc(a, b, subItemwise);
}


function mulScalar(o, scalar) {
  if (o.mulScalar !== undefined) {
    return o.mulScalar(scalar);
  }
  
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


export { addItemwise, subItemwise };
