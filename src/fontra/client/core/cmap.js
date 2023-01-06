export function makeReverseMapping(cmap) {
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


export function getCmapWrapper(cmap, revCmap) {

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
