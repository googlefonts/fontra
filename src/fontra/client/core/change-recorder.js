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
