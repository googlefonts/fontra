export class ChangeCollector {

  constructor() {
    this._forwardChanges = [];
    this._rollbackChanges = [];
  }

  get hasChange() {
    return !!this._forwardChanges.length;
  }

  get change() {
    return consolidateChanges(this._forwardChanges);
  }

  get hasRollbackChange() {
    return !!this._rollbackChanges.length;
  }

  get rollbackChange() {
    return consolidateChanges(this._rollbackChanges);
  }

  addChange(func, ...args) {
    this._forwardChanges.push({f: func, a: args});
  }

  addRollbackChange(func, ...args) {
    this._rollbackChanges.splice(0, 0, {f: func, a: args});
  }

  subCollector(...path) {
    const sub = new ChangeCollector();
    if (equalPath(path, lastItem(this._forwardChanges)?.p)) {
      sub._forwardChanges = lastItem(this._forwardChanges).c;
    } else {
      this._forwardChanges.push({p: path, c: sub._forwardChanges});
    }
    if (equalPath(path, this._rollbackChanges[0]?.p)) {
      sub._rollbackChanges = this._rollbackChanges[0].c;
    } else {
      this._rollbackChanges.splice(0, 0, {p: path, c: sub._rollbackChanges});
    }
    return sub;
  }

}


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
  const children = change.c?.map(
    child => unnestSingleChildren(child)
  ).filter(isNotEmpty);

  if (!children?.length) {
    if (children?.length === 0) {
      // Remove empty children array
      change = {...change};
      delete change.c;
    }
    if (!change.f) {
      // This change doesn't do anything
      change = {};
    }
    return change;
  }
  // Recursively unnest and prune
  if (children.length !== 1) {
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
  if (!changes.length) {
    return commonPrefix;
  }
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

const baseChangeFunctions = {
  "=": (subject, key, item) => subject[key] = item,
  "-": (subject, index, deleteCount = 1) => subject.splice(index, deleteCount),
  "+": (subject, index, ...items) => subject.splice(index, 0, ...items),
  ":": (subject, index, deleteCount, ...items) => subject.splice(index, deleteCount, ...items),
};


// TODO: Refactor. These don't really belong here, and should ideally be registered from outside
const changeFunctions = {
  ...baseChangeFunctions,
  "=xy": (path, pointIndex, x, y) => path.setPointPosition(pointIndex, x, y),
  "insertContour": (path, contourIndex, contour) => path.insertContour(contourIndex, contour),
  "deleteContour": (path, contourIndex) => path.deleteContour(contourIndex),
  "deletePoint": (path, contourIndex, contourPointIndex) => path.deletePoint(contourIndex, contourPointIndex),
  "insertPoint": (path, contourIndex, contourPointIndex, point) => path.insertPoint(contourIndex, contourPointIndex, point),
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


export function applyChange(subject, change) {
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
    applyChange(subject, subChange);
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


function equalPath(p1, p2) {
  if (p1.length !== p2?.length) {
    return false;
  }
  for (let i = 0; i < p1.length; i++) {
    if (p1[i] !== p2[i]) {
      return false;
    }
  }
  return true;
}


function lastItem(array) {
  if (array.length) {
    return array[array.length - 1];
  }
}


function isNotEmpty(obj) {
  for (const _ in obj) {
    return true;
  }
  return false;
}
