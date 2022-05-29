import { consolidateChanges } from "../core/changes.js";


export class EditBehavior {

  constructor(instance, selection) {
    this.instance = instance;
    this.selections = splitSelection(selection);
    this.setupPointEditFuncs();
    this.setupComponentEditFuncs();
    this.rollbackChange = makeRollbackChange(this.instance, this.selections);
  }

  setupPointEditFuncs() {
    const path = this.instance.path;
    this.pointEditFuncs = this.selections["point"]?.map(
      pointIndex => makePointTransformFunc(path, pointIndex)
    );
    const [editFuncs1, editFuncs2] = makePointEditFuncs(
      path, splitPointSelectionPerContour(path, this.selections["point"] || [])
    );
  }

  setupComponentEditFuncs() {
    const components = this.instance.components;
    this.componentEditFuncs = this.selections["component"]?.map(
      componentIndex => makeComponentTransformFunc(components, componentIndex)
    );
  }

  makeChangeForDelta(delta) {
    return this.makeChangeForTransformFunc(
      point => {
        return {"x": point.x + delta.x, "y": point.y + delta.y};
      }
    );
  }

  makeChangeForTransformFunc(transformFunc) {
    const pathChanges = this.pointEditFuncs?.map(
      editFunc => makePointChange(...editFunc(transformFunc))
    );
    const componentChanges = this.componentEditFuncs?.map(
      editFunc => makeComponentOriginChange(...editFunc(transformFunc))
    );
    const changes = [];
    if (pathChanges && pathChanges.length) {
      changes.push(consolidateChanges(pathChanges, ["path"]));
    }
    if (componentChanges && componentChanges.length) {
      changes.push(consolidateChanges(componentChanges, ["components"]));
    }
    return consolidateChanges(changes);
  }

}


function makeRollbackChange(instance, selections) {
  const path = instance.path;
  const components = instance.components;

  const pointRollback = selections["point"]?.map(
    pointIndex => {
      const point = path.getPoint(pointIndex);
      return makePointChange(pointIndex, point.x, point.y);
    }
  );
  const componentRollback = selections["component"]?.map(
    componentIndex => {
      const t = components[componentIndex].transformation;
      return makeComponentOriginChange(componentIndex, t.x, t.y);
    }
  );
  const changes = [];
  if (pointRollback) {
    changes.push(consolidateChanges(pointRollback, ["path"]));
  }
  if (componentRollback) {
    changes.push(consolidateChanges(componentRollback, ["components"]));
  }
  return consolidateChanges(changes);
}


function makePointTransformFunc(path, pointIndex) {
  const point = path.getPoint(pointIndex);
  return transformFunc => {
    const editedPoint = transformFunc(point);
    return [pointIndex, editedPoint.x, editedPoint.y]
  };
}


function makeComponentTransformFunc(components, componentIndex) {
  const origin = {
    "x": components[componentIndex].transformation.x,
    "y": components[componentIndex].transformation.y,
  };
  return transformFunc => {
    const editedOrigin = transformFunc(origin);
    return [componentIndex, editedOrigin.x, editedOrigin.y];
  }
}


function makePointChange(pointIndex, x, y) {
  return {"f": "=xy", "k": pointIndex, "a": [x, y]};
}


function makeComponentOriginChange(componentIndex, x, y) {
  return {
    "p": [componentIndex, "transformation"],
    "c": [{"f": "=", "k": "x", "v": x}, {"f": "=", "k": "y", "v": y}],
  };
}


function splitSelection(selection) {
  const result = {};
  for (const selItem of selection) {
    let [tp, index] = selItem.split("/");
    if (result[tp] === undefined) {
      result[tp] = [];
    }
    result[tp].push(Number(index));
  }
  for (const indices of Object.values(result)) {
    // Ensure indices are sorted
    indices.sort((a, b) => a - b);
  }
  return result;
}


function splitPointSelectionPerContour(path, pointIndices) {
  const contours = new Array(path.contourInfo.length);
  let contourIndex = 0;
  for (const pointIndex of pointIndices) {
    while (path.contourInfo[contourIndex].endPoint < pointIndex) {
      contourIndex++;
    }
    if (contours[contourIndex] === undefined) {
      contours[contourIndex] = [];
    }
    contours[contourIndex].push(pointIndex);
  }
  return contours;
}


function makePointEditFuncs(path, selectedContourPointIndices) {
  let contourStartPoint = 0;
  const pointEditFuncs1 = [];
  const pointEditFuncs2 = [];
  for (let i = 0; i < path.contourInfo.length; i++) {
    const contourEndPoint = path.contourInfo[i].endPoint + 1;
    const selectedPointIndices = selectedContourPointIndices[i];
    if (selectedPointIndices !== undefined) {
      const [editFuncs1, editFuncs2] = makeContourPointEditFuncs(
        path, selectedPointIndices, contourStartPoint, contourEndPoint, path.contourInfo[i].isClosed
      );
      pointEditFuncs1.push(...editFuncs1);
      pointEditFuncs2.push(...editFuncs2);
    }
    contourStartPoint = contourEndPoint;
  }
  return [pointEditFuncs1, pointEditFuncs2];
}


function makeContourPointEditFuncs(path, selectedPointIndices, startPoint, endPoint, isClosed) {
  const numPoints = endPoint - startPoint;
  const participatingPoints = new Array(numPoints);
  for (let i = 0; i < numPoints; i++) {
    participatingPoints[i] = path.getPoint(i + startPoint);
  }
  for (const pointIndex of selectedPointIndices) {
    participatingPoints[pointIndex - startPoint].selected = true;
  }
  const editFuncs1 = [];
  const editFuncs2 = [];
  return [editFuncs1, editFuncs2];
}


function modulo(a, b) {
  // Modulo with Python behavior for negative numbers
  const result = a % b;
  if (result < 0) {
    return result + b;
  }
  return result;
}
