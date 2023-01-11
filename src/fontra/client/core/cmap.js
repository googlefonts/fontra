//
// A `cmap` is an object with integer numbers representing unicode code points
// as keys, and glyph names as values. Note: we're using a JS Object, not Map,
// so the code point keys are stored as (decimal) string representations of the
// integers. Multiple code points may map to the same glyph name.
//
// A `revCmap` ("reverse cmap") maps glyph names to arrays of (integer) code
// points. A code point may only occur one time in the entire mapping.
// Empty code point arrays are generally avoided: the `revCmap` should then
// Not contain a mapping for the glyph name at all.
// For the sake of determinism, this module tries to keep the code point arrays
// in sorted order, even though the order has no intrinsic meaning.
//
// This module provides functions to convert `cmap` to `revCmap` and vice versa,
// as well as `cmap` and `revCmap` proxy objects that keep their matching
// counterpart (`revCmap` and `cmap` respectively) up-to-date.
//


export function makeGlyphMapFromCharacterMap(cmap) {
  // Return a `revCmap` constructed from `cmap`
  const revCmap = {};
  for (const [codeStr, glyphName] of Object.entries(cmap)) {
    const codePoint = parseInt(codeStr);
    if (revCmap[glyphName]) {
      arrayInsertSortedItem(revCmap[glyphName], codePoint);
    } else {
      revCmap[glyphName] = [codePoint];
    }
  }
  return revCmap;
}


export function makeCharacterMapFromGlyphMap(revCmap, strict = true) {
  // Return a `cmap` constructed from `revCmap`
  // If the `strict` flag is `true` (default), an Error is thrown when a code
  // point is defined multiple times.
  const cmap = {};
  for (const [glyphName, unicodes] of Object.entries(revCmap)) {
    for (const codePoint of unicodes) {
      if (codePoint in cmap) {
        const message = `invalid reverse cmap: duplicate code point (${codePoint})`;
        if (strict) {
          throw new Error(message);
        }
        console.log(message);
        if (cmap[codePoint] < glyphName) {
          // Keep the glyph name that would be sorted lowest.
          // This is completely arbitrary, but ensures determinism.
          continue;
        }
      }
      cmap[codePoint] = glyphName;
    }
  }
  return cmap;
}


export function getGlyphMapProxy(revCmap, cmap) {
  //
  // Return a wrapper (Proxy) for `revCmap`, that behaves exactly like `revCmap`,
  // while keeping the matching `cmap` synchronized.
  //
  // `revCmap` and `cmap` are expected to be synchronized on input.
  //
  // Any changes made to `revCmap` via the `revCmap` proxy will be reflected in
  // the `cmap` object. This does *not* catch mutations in the code point arrays
  // themselves, but only wholesale *replacement* the code point arrays. In other
  // words: you must treat the code point arrays as immutable.
  //

  const handler = {
    set(revCmap, prop, value) {
      if (!Array.isArray(value)) {
        throw new Error("value expected to be an array of code points");
      }
      const existingCodePoints = revCmap[prop] || [];
      revCmap[prop] = value;
      existingCodePoints.forEach(codePoint => delete cmap[codePoint]);
      value.forEach(codePoint => cmap[codePoint] = prop);
      return true;
    },

    get(revCmap, prop) {
      return revCmap[prop];
    },

    deleteProperty(revCmap, prop) {
      const existingCodePoints = revCmap[prop] || [];
      delete revCmap[prop];
      existingCodePoints.forEach(codePoint => delete cmap[codePoint]);
      return true;
    }
  }

  return new Proxy(revCmap, handler);
}


export function getCharacterMapProxy(cmap, revCmap) {
  //
  // Return a wrapper (Proxy) for `cmap`, that behaves exactly like `cmap`,
  // while keeping the matching `revCmap` synchronized.
  //
  // `cmap` and `revCmap` are expected to be synchronized on input.
  //
  // Any changes made to `cmap` via the `cmap` proxy will be reflected in
  // the `revCmap` object.
  //

  const handler = {
    set(cmap, prop, value) {
      const existingValue = cmap[prop];
      cmap[prop] = value;
      if (!isNaN(prop)) {
        const codePoint = parseInt(prop);
        if (existingValue) {
          removeReverseMapping(revCmap, existingValue, codePoint);
        }
        if (revCmap[value]) {
          arrayInsertSortedItem(revCmap[value], codePoint);
        } else {
          revCmap[value] = [codePoint];
        }
      }
      return true;
    },

    get(cmap, prop) {
      return cmap[prop];
    },

    deleteProperty(cmap, prop) {
      const existingValue = cmap[prop];
      delete cmap[prop];
      if (!isNaN(prop)) {
        const codePoint = parseInt(prop);
        if (existingValue) {
          removeReverseMapping(revCmap, existingValue, codePoint);
        }
      }
      return true;
    }
  }

  return new Proxy(cmap, handler);
}


function removeReverseMapping(revCmap, glyphName, codePoint) {
  //
  // Given a `revCmap`, remove the `codePoint` from the `glyphName` mapping,
  // if it exists. If no mapping is left for `glyphName`, remove the mapping
  // entirely.
  //
  const unicodes = revCmap[glyphName];
  if (!unicodes) {
    return;
  }
  arrayDiscardItem(unicodes, codePoint);
  if (!unicodes.length) {
    delete revCmap[glyphName];
  }
}


function arrayDiscardItem(array, item) {
  // Remove `item` from `array` if present
  const index = array.indexOf(item);
  if (index >= 0) {
    array.splice(index, 1);
  }
}


function arrayInsertSortedItem(array, item) {
  // Insert integer `item` into the sorted `array`, maintaining the sorted order
  // These arrays are generally very short, no need to bisect
  for (let index = 0; index < array.length; index++) {
    if (item < array[index]) {
      array.splice(index, 0, item);
      return;
    }
  }
  array.push(item);
}
