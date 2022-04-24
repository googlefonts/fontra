import { consolidateChanges } from "../core/changes.js";


export class EditBehavior {

  constructor(instance, selection) {
    this.instance = instance;
    this.selection = selection;
    this.setupEditFuncs();
    this.rollbackChange = makeRollbackChange(instance, selection);
  }

  setupEditFuncs() {
    const path = this.instance.path;
    const components = this.instance.components;
    const editFuncs = [];

    this.editFuncs = mapSelection(this.selection,
      {
        "point": pointIndex => makePointTransformFunc(path, pointIndex),
        "component": componentIndex => makeComponentTransformFunc(components, componentIndex),
      }
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
    const pathChanges = this.editFuncs["point"]?.map(
      editFunc => makePointChange(...editFunc(transformFunc))
    );
    const componentChanges = this.editFuncs["component"]?.map(
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


function makeRollbackChange(instance, selection) {
  const path = instance.path;
  const components = instance.components;

  const rollbacks = mapSelection(selection,
    {
      "point": pointIndex => {
        const point = path.getPoint(pointIndex);
        return makePointChange(pointIndex, point.x, point.y);
      },
      "component": componentIndex => {
        const t = components[componentIndex].transformation;
        return makeComponentOriginChange(componentIndex, t.x, t.y);
      },
    }
  );
  const changes = [];
  if (rollbacks["point"]) {
    changes.push(consolidateChanges(rollbacks["point"], ["path"]));
  }
  if (rollbacks["component"]) {
    changes.push(consolidateChanges(rollbacks["component"], ["components"]));
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


function mapSelection(selection, funcs) {
  const result = {};
  for (const selItem of selection) {
    let [tp, index] = selItem.split("/");
    index = Number(index);
    const f = funcs[tp];
    if (f !== undefined) {
      if (!(tp in result)) {
        result[tp] = [];
      }
      result[tp].push(f(index));
    }
  }
  return result;
}
