import { consolidateChanges } from "./changes.js";
import { range, reversed } from "./utils.js";


export class PackedPathChangeRecorder {

  constructor(path, rollbackChanges, editChanges) {
    this.path = path;
    this.rollbackChanges = rollbackChanges || [];
    this.editChanges = editChanges || [];
    this.contourIndices = [...range(path.contourInfo.length)];
    this.contourPointIndices = new Array(path.contourInfo.length);
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

  deleteContour(contourIndex) {
    const contour = this.path.getContour(contourIndex);
    this.contourIndices.splice(contourIndex, 1);
    this.rollbackChanges.push(change(["path"], "insertContour", contourIndex, contour));
    this.editChanges.push(change(["path"], "deleteContour", contourIndex));
  }

  insertContour(contourIndex, contour) {
    this.contourIndices.splice(contourIndex, 0, null);
    this.rollbackChanges.push(change(["path"], "deleteContour", contourIndex));
    this.editChanges.push(change(["path"], "insertContour", contourIndex, contour));
  }

  deletePoint(contourIndex, contourPointIndex) {
    const point = this.path.getContourPoint(contourIndex, contourPointIndex);
    const contourPointIndices = this._getContourPointIndices(contourIndex);
    contourPointIndices.splice(contourPointIndex, 1);
    this.rollbackChanges.push(
      change(["path"], "insertPoint", contourIndex, contourPointIndex, point));
    this.editChanges.push(
      change(["path"], "deletePoint", contourIndex, contourPointIndex));
  }

  insertPoint(contourIndex, contourPointIndex, point) {
    const contourPointIndices = this._getContourPointIndices(contourIndex);
    contourPointIndices.splice(contourPointIndex, 0, null);
    this.rollbackChanges.push(
      change(["path"], "deletePoint", contourIndex, contourPointIndex));
    this.editChanges.push(
      change(["path"], "insertPoint", contourIndex, contourPointIndex, point));
  }

  openCloseContour(contourIndex, close) {
    this.rollbackChanges.push(
      change(["path", "contourInfo", contourIndex], "=", "isClosed",
        this.path.contourInfo[contourIndex].isClosed));
    this.editChanges.push(
      change(["path", "contourInfo", contourIndex], "=", "isClosed", close));
  }

  setPointPosition(pointIndex, x, y) {
    if (this.rollbackChanges) {
      const [oldX, oldY] = this.path.getPointPosition(pointIndex);
      this.rollbackChanges.push(change(["path"], "=xy", pointIndex, oldX, oldY));
    }
    this.editChanges.push(change(["path"], "=xy", pointIndex, x, y));
  }

  setPointType(pointIndex, pointType) {
    this.rollbackChanges.push(
      change(["path", "pointTypes"], "=", pointIndex, this.path.pointTypes[pointIndex]));
    this.editChanges.push(
      change(["path", "pointTypes"], "=", pointIndex, pointType));
  }

  _getContourPointIndices(contourIndex) {
    if (this.contourPointIndices[contourIndex] === undefined) {
      const realContourIndex = this.contourIndices[contourIndex];
      if (realContourIndex !== undefined) {
        this.contourPointIndices[contourIndex] =
          [...range(this.path.getNumPointsOfContour(this.contourIndices[contourIndex]))];
        } else {
          this.contourPointIndices[contourIndex] = []; // ????
        }
    }
    return this.contourPointIndices[contourIndex];
  }

}


function change(path, func, ...args) {
  return {
    "p": path,
    "f": func,
    "a": args,
  };
}
