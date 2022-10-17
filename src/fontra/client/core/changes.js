export function consolidateChanges(changes, prefixPath) {
  let change;
  let path;
  if (!Array.isArray(changes)) {
    changes = [changes];
  }
  if (changes.length === 1) {
    change = {...changes[0]};
    path = change.p;
  } else {
    const commonPrefix = findCommonPrefix(changes);
    const numCommonElements = commonPrefix.length;
    if (numCommonElements) {
      changes = changes.map(change => {
        const newChange = {...change};
        newChange.p = change.p.slice(numCommonElements);
        if (!newChange.p.length) {
          delete newChange.p;
        }
        return newChange;
      });
      path = commonPrefix;
    } else {
      // Zap empty p
      changes = changes.map(change => {
        const newChange = {...change};
        if (newChange.p && !newChange.p.length) {
          delete newChange.p;
        }
        return newChange;
      });
    }
    change = {"c": changes};
  }
  if (path?.length) {
    change["p"] = path;
  } else {
    delete change["p"];
  }

  change = unnestSingleChildren(change);

  if (prefixPath?.length) {
    change = addPathPrefix(change, prefixPath);
  }

  return change;
}


function unnestSingleChildren(change) {
  const numChildren = change.c?.length;
  if (!numChildren) {
    if (numChildren === 0) {
      // Remove empty children array
      change = {...change};
      delete change.c;
    }
    return change;
  }
  // Recursively unnest
  const children = change.c.map(child => unnestSingleChildren(child));
  if (numChildren !== 1) {
    change = {...change};
    change.c = children;
    return change;
  }
  const child = children[0];
  let path;
  const childPath = child.p || [];
  if (change.p?.length) {
    path = change.p.concat(childPath);
  } else {
    path = childPath;
  }
  change = {...child};
  if (path.length) {
    change.p = path;
  } else {
    delete change.p;
  }
  return change;
}


function addPathPrefix(change, prefixPath) {
  const prefixedChanged = {...change};
  prefixedChanged.p = prefixPath.concat(prefixedChanged.p || []);
  return prefixedChanged;
}


function findCommonPrefix(changes) {
  const commonPrefix = [];
  for (const change of changes) {
    if (!change.p || !change.p.length) {
      return commonPrefix;
    }
  }
  let index = 0;
  while (true) {
    let pathElement = changes[0].p[index];
    if (!pathElement) {
      return commonPrefix;
    }
    for (let i = 1; i < changes.length; i++) {
      if (changes[i].p[index] !== pathElement) {
        return commonPrefix;
      }
    }
    commonPrefix.push(pathElement);
    index++;
  }
  return commonPrefix;
}

export const baseChangeFunctions = {
  "=": (subject, key, item) => subject[key] = item,
  "-": (subject, index, deleteCount = 1) => subject.splice(index, deleteCount),
  "+": (subject, index, ...items) => subject.splice(index, 0, ...items),
  ":": (subject, index, deleteCount, ...items) => subject.splice(index, deleteCount, ...items),
};


//
// A "change" object is a simple JS object containing several
// keys.
//
// "p": an array of path items, eg. ["glyphs", "Aring"]
// Optional: can be omitted if empty.
//
// "f": function name, to be lookud up in the changeFunctions dict
// Optional: can be omitted if the change has children
//
// "a": "arguments", an array of arguments for the change function
// Optional: if omitted, defaults to an empty array
//
// "c": Array of child changes. Optional.
//


export function applyChange(subject, change, changeFunctions) {
  const path = change["p"] || [];
  const functionName = change["f"];
  const children = change["c"] || [];

  for (const pathElement of path) {
    subject = subject[pathElement];
    if (subject === undefined) {
      throw new Error(`assert -- invalid change path: ${path}`);
    }
  }

  if (functionName) {
    const changeFunc = changeFunctions[functionName];
    const args = change["a"] || [];
    changeFunc(subject, ...args);
  }

  for (const subChange of children) {
    applyChange(subject, subChange, changeFunctions);
  }
}


export function matchChange(change, matchPath) {
  const path = change["p"] || [];
  const children = change["c"] || [];
  matchPath = Array.from(matchPath);

  for (const pathElement of path) {
    if (pathElement !== matchPath.shift()) {
      return false;
    }
    if (!matchPath.length) {
      return true;
    }
  }

  for (const subChange of children) {
    if (matchChange(subChange, matchPath)) {
      return true;
    }
  }

  return false;
}
