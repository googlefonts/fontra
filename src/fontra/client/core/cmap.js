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

export function makeReverseMapping(cmap) {
  // Return a `revCmap` constructed from `cmap`
  const revCmap = {};
  for (const [codeStr, glyphName] of Object.entries(cmap)) {
    const codepoint = parseInt(codeStr);
    if (revCmap[glyphName]) {
      arrayInsertSortedItem(revCmap[glyphName], codepoint);
    } else {
      revCmap[glyphName] = [codepoint];
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
    for (const codepoint of unicodes) {
      if (codepoint in cmap) {
        const message = `invalid reverse cmap: duplicate code point (${codepoint})`;
        if (strict) {
          throw new Error(message);
        }
        console.log(message);
        if (cmap[codepoint] < glyphName) {
          continue;
        }
      }
      cmap[codepoint] = glyphName;
    }
  }
  return cmap;
}


export function getCmapWrapper(cmap, revCmap) {
  //
  // Return a wrapper (Proxy) for `cmap`, that behaves exactly like `cmap`,
  // while keeping the matching `revCmap` synchronized.
  //

  const handler = {
    set(cmap, prop, value) {
      const existingValue = cmap[prop];
      cmap[prop] = value;
      if (!isNaN(prop)) {
        const codepoint = parseInt(prop);
        if (existingValue) {
          removeReverseMapping(revCmap, existingValue, codepoint);
        }
        if (revCmap[value]) {
          arrayInsertSortedItem(revCmap[value], codepoint);
        } else {
          revCmap[value] = [codepoint];
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
        const codepoint = parseInt(prop);
        if (existingValue) {
          removeReverseMapping(revCmap, existingValue, codepoint);
        }
      }
      return true;
    }
  }

  return new Proxy(cmap, handler);
}


function removeReverseMapping(revCmap, glyphName, codepoint) {
  //
  // Given a `revCmap`, remove the `codepoint` from the `glyphName` mapping,
  // if it exists. If no mapping is left for `glyphName`, remove the mapping
  // entirely.
  //
  const unicodes = revCmap[glyphName];
  if (!unicodes) {
    return;
  }
  arrayDiscardItem(unicodes, codepoint);
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
