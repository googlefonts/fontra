//
// A `cmap` is an object with integer numbers representing unicode code points
// as keys, and glyph names as values. Note: we're using a JS Object, not Map,
// so the code point keys are stored as string representations of the integers.
// Multiple code points may map to the same glyph.
//
// A `revCmap` ("reverse cmap") maps glyph names to arrays of (integer) code
// points. A code point may only occur one time in the entire mapping.
// Empty code point arrays are generally avoided: the `revCmap` should then
// Not contain a mapping for the glyph name at all.
// For the sake of determinism, this module tries to keep the code point arrays
// in sorted order, even though the order has no intrinsic meaning.
//
// This module provides functions to convert `cmap` to `revCmap` and vice versa,
// as well as a `cmap` proxy object that keeps a matching `revCmap` up-to-date
// under `cmap` modifications.
//


export function makeReverseMapping(cmap) {
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


export function makeMappingFromReverseMapping(revCmap, strict = true) {
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


export function getCmapWrapper(cmap, revCmap) {
  //
  // Return a wrapper (Proxy) for `cmap`, that behaves exactly like `cmap`,
  // while keeping the matching `revCmap` synchronized.
  //
  // `cmap` and `revCmap` are expected to be synchronized on input.
  //
  // Any changes made to `cmap` via the `cmap` proxy will be reflected in
  // the `revCmap` object. The reverse is not true: `revCmap` should not
  // be modified directly, but *only* via the `cmap` proxy.
  //
  // TODO: if needed we could provide getRevCmapWrapper(cmap, revCmap) as well.

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
