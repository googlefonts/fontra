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
        "point": pointIndex => makePointDragFunc(path, pointIndex),
        "component": componentIndex => makeComponentDragFunc(components, componentIndex),
      }
    );
  }

  makeChangeForDelta(delta) {
    const pathChanges = this.editFuncs["point"]?.map(
      editFunc => makePointChange(...editFunc(delta))
    );
    const componentChanges = this.editFuncs["component"]?.map(
      editFunc => makeComponentOriginChange(...editFunc(delta))
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


function makePointDragFunc(path, pointIndex) {
  const point = path.getPoint(pointIndex);
  return delta => [pointIndex, point.x + delta.x, point.y + delta.y];
}


function makeComponentDragFunc(components, componentIndex) {
  const x = components[componentIndex].transformation.x;
  const y = components[componentIndex].transformation.y;
  return delta => [componentIndex, x + delta.x, y + delta.y];
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
