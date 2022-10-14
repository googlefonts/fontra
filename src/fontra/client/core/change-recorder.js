import { consolidateChanges } from "./changes.js";
import { range, reversed } from "./utils.js";


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
