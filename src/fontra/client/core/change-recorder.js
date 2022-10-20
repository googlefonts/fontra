import { ChangeCollector, applyChange, consolidateChanges } from "./changes.js";
import { range, reversed } from "./utils.js";


export function recordChanges(subject, func) {
  const changes = new ChangeCollector();
  try {
    func(getProxy(subject, changes));
  } catch(error) {
    applyChange(subject, changes.rollbackChange);
    throw error;
  }
  return changes;
}


function getArrayProxyMethods(subject, changes) {
  return {
    push(...items) {
      changes.addChange("+", subject.length, ...items);
      changes.addRollbackChange("-", subject.length, items.length);
      subject.push(...items);
    },
    splice(index, deleteCount, ...items) {
      changes.addChange(":", index, deleteCount, ...items);
      changes.addRollbackChange(":", index, items.length, ...subject.slice(index, index + deleteCount));
      subject.splice(index, deleteCount, ...items);
    }
  };
}


function getVarPackedPathProxyMethods(subject, changes) {
  return {
    insertContour(index, contour) {
      changes.addChange("insertContour", index, contour);
      changes.addRollbackChange("deleteContour", index);
      subject.insertContour(index, contour);
    },
    deleteContour(index) {
      changes.addChange("deleteContour", index);
      changes.addRollbackChange("insertContour", index, subject.getContour(index));
      subject.deleteContour(index);
    },
    insertPoint(contourIndex, contourPointIndex, point) {
      changes.addChange("insertPoint", contourIndex, contourPointIndex, point);
      changes.addRollbackChange("deletePoint", contourIndex, contourPointIndex);
      subject.insertPoint(contourIndex, contourPointIndex, point);
    },
    deletePoint(contourIndex, contourPointIndex) {
      changes.addChange("deletePoint", contourIndex, contourPointIndex);
      changes.addRollbackChange("insertPoint", contourIndex, contourPointIndex, subject.getContourPoint(contourIndex, contourPointIndex));
      subject.deletePoint(contourIndex, contourPointIndex);
    },
    setPointPosition(pointIndex, x, y) {
      changes.addChange("=xy", pointIndex, x, y);
      changes.addRollbackChange("=xy", pointIndex, ...subject.getPointPosition(pointIndex));
      subject.setPointPosition(pointIndex, x, y);
    },
  };
}


export const proxyMethodsMap = {
  "Array": getArrayProxyMethods,
  "VarPackedPath": getVarPackedPathProxyMethods,  // Poss. need to change the key to VarPackedPath.name when minifying
}


function getProxy(subject, changes) {
  if (!needsProxy(subject)) {
    throw new Error(`subject must be an object`);
  }

  const getMethods = proxyMethodsMap[subject.constructor.name];
  const methods = getMethods !== undefined ? getMethods(subject, changes) : {};
  const isArray = Array.isArray(subject);

  const handler = {
    set(subject, prop, value) {
      if (isArray && !isNaN(prop)) {
        prop = parseInt(prop);
      }
      changes.addChange("=", prop, value);
      if (!isArray && subject[prop] === undefined) {
        changes.addRollbackChange("d", prop);
      } else {
        changes.addRollbackChange("=", prop, subject[prop]);
      }
      subject[prop] = value;
      return true;
    },

    get(subject, prop) {
      const method = methods[prop];
      if (method) {
        return method;
      }
      if (isArray && !isNaN(prop)) {
        prop = parseInt(prop);
      }
      subject = subject[prop];
      return (
        needsProxy(subject)
        ?
        getProxy(subject, changes.subCollector(prop))
        :
        subject
      );
    },

    deleteProperty(subject, prop) {
      if (isArray) {
        throw new Error("can't delete array item");
      } else {
        if (subject[prop] === undefined) {
          throw new Error("can't delete undefined property");
        }
        changes.addChange("d", prop);
        changes.addRollbackChange("=", prop, subject[prop]);
        delete subject[prop];
      }
      return true;
    }
  }
  return new Proxy(subject, handler);
}


function needsProxy(subject) {
  return subject !== null && typeof subject === "object";
}


// ====================== to be deleted ============================


class BaseRecorder {

  constructor(rollbackChanges, editChanges) {
    this.rollbackChanges = rollbackChanges || [];
    this.editChanges = editChanges || [];
  }

  get hasChange() {
    return !!this.editChanges.length;
  }

  get rollbackChange() {
    if (this.rollbackChanges.length) {
      return consolidateChanges([...reversed(this.rollbackChanges)])
    }
  }

  get editChange() {
    if (this.editChanges.length) {
      return consolidateChanges(this.editChanges);
    }
  }

}

export class InstanceChangeRecorder extends BaseRecorder {

  constructor(instance) {
    super();
    this.instance = instance;
  }

  get path() {
    if (this._path === undefined) {
      this._path = this.instance.path.copy();
    }
    return new PackedPathChangeRecorder(this._path, this.rollbackChanges, this.editChanges, true);
  }

  get components() {
    if (this._components === undefined) {
      this._components = copyComponents(this.instance.components);
    }
    return new ComponentsChangeRecorder(this._components, this.rollbackChanges, this.editChanges);
  }

}


class ComponentsChangeRecorder extends BaseRecorder {

  constructor(components, rollbackChanges, editChanges) {
    super(rollbackChanges, editChanges);
    this.components = components;
  }

  deleteComponent(componentIndex) {
    this.rollbackChanges.push(change(["components"], "+", componentIndex, this.components[componentIndex]));
    this.editChanges.push(change(["components"], "-", componentIndex));
    this.components.splice(componentIndex, 1);
  }

  insertComponent(componentIndex, component) {
    this.rollbackChanges.push(change(["components"], "-", componentIndex));
    this.editChanges.push(change(["components"], "+", componentIndex, component));
    this.components.splice(componentIndex, 0, component);
  }

}


export class PackedPathChangeRecorder extends BaseRecorder {

  constructor(path, rollbackChanges, editChanges, noCopy = false) {
    super(rollbackChanges, editChanges);
    this.path = noCopy ? path : path.copy();
  }

  deleteContour(contourIndex) {
    const contour = this.path.getContour(contourIndex);
    this.rollbackChanges.push(change(["path"], "insertContour", contourIndex, contour));
    this.editChanges.push(change(["path"], "deleteContour", contourIndex));
    this.path.deleteContour(contourIndex);
  }

  insertContour(contourIndex, contour) {
    this.rollbackChanges.push(change(["path"], "deleteContour", contourIndex));
    this.editChanges.push(change(["path"], "insertContour", contourIndex, contour));
    this.path.insertContour(contourIndex, contour);
  }

  deletePoint(contourIndex, contourPointIndex) {
    const point = this.path.getContourPoint(contourIndex, contourPointIndex);
    this.rollbackChanges.push(
      change(["path"], "insertPoint", contourIndex, contourPointIndex, point));
    this.editChanges.push(
      change(["path"], "deletePoint", contourIndex, contourPointIndex));
    this.path.deletePoint(contourIndex, contourPointIndex);
  }

  insertPoint(contourIndex, contourPointIndex, point) {
    this.rollbackChanges.push(
      change(["path"], "deletePoint", contourIndex, contourPointIndex));
    this.editChanges.push(
      change(["path"], "insertPoint", contourIndex, contourPointIndex, point));
    this.path.insertPoint(contourIndex, contourPointIndex, point);
  }

  openCloseContour(contourIndex, close) {
    this.rollbackChanges.push(
      change(["path", "contourInfo", contourIndex], "=", "isClosed",
        this.path.contourInfo[contourIndex].isClosed));
    this.editChanges.push(
      change(["path", "contourInfo", contourIndex], "=", "isClosed", close));
    this.path.contourInfo[contourIndex].isClosed = close
  }

  setPointPosition(pointIndex, x, y) {
    if (this.rollbackChanges) {
      this.rollbackChanges.push(
        change(["path"], "=xy", pointIndex, ...this.path.getPointPosition(pointIndex)));
    }
    this.editChanges.push(change(["path"], "=xy", pointIndex, x, y));
    this.path.setPointPosition(pointIndex, x, y);
  }

  setPointType(pointIndex, pointType) {
    this.rollbackChanges.push(
      change(["path", "pointTypes"], "=", pointIndex, this.path.pointTypes[pointIndex]));
    this.editChanges.push(
      change(["path", "pointTypes"], "=", pointIndex, pointType));
    this.path.pointTypes[pointIndex] = pointType;
  }

}


function change(path, func, ...args) {
  return {
    "p": path,
    "f": func,
    "a": args,
  };
}


function copyComponents(components) {
  return components.map(compo => {
    return {
      "name": compo.name,
      "transformation": {...compo.transformation},
      "location": {...compo.location},
    };
  });
}
