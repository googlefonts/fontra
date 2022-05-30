import { consolidateChanges } from "../core/changes.js";
import { reversed } from "../core/utils.js";


export class EditBehavior {

  constructor(instance, selection) {
    this.instance = instance;
    this.selections = splitSelection(selection);
    this.setupPointEditFuncs();
    this.setupComponentEditFuncs();
    this.rollbackChange = makeRollbackChange(this.instance, this.selections["point"], this.selections["component"]);
  }

  setupPointEditFuncs() {
    const path = this.instance.path;
    this.pointEditFuncs = makePointEditFuncs(
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


function makeRollbackChange(instance, pointSelection, componentSelection) {
  const path = instance.path;
  const components = instance.components;

  const pointRollback = pointSelection?.map(
    pointIndex => {
      const point = path.getPoint(pointIndex);
      return makePointChange(pointIndex, point.x, point.y);
    }
  );
  const componentRollback = componentSelection?.map(
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
  const pointEditFuncs = [];
  for (let i = 0; i < path.contourInfo.length; i++) {
    const contourEndPoint = path.contourInfo[i].endPoint + 1;
    const selectedPointIndices = selectedContourPointIndices[i];
    if (selectedPointIndices !== undefined) {
      const editFuncs = makeContourPointEditFuncs(
        path, selectedPointIndices, contourStartPoint, contourEndPoint, path.contourInfo[i].isClosed
      );
      pointEditFuncs.push(...editFuncs);
    }
    contourStartPoint = contourEndPoint;
  }
  return pointEditFuncs;
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
  const originalPoints = Array.from(participatingPoints);
  const temporaryPoints = Array.from(participatingPoints);
  const editFuncsTransform = [];
  const editFuncsConstrain = [];
  for (let i = 0; i < numPoints; i++) {
    let match = defaultMatchTable;
    const neighborIndicesForward = new Array();
    for (let j = -2; j < 3; j++) {
      let neighborIndex = i + j;
      if (isClosed) {
        neighborIndex = modulo(neighborIndex, numPoints);
      }
      neighborIndicesForward.push(neighborIndex);
      const point = participatingPoints[neighborIndex];
      let pointType;
      if (point === undefined) {
        pointType = DOESNT_EXIST;
      } else {
        const smooth = boolInt(point.smooth);
        const oncurve = boolInt(point.type === 0);
        const selected = boolInt(point.selected);
        pointType = POINT_TYPES[smooth][oncurve][selected];
      }
      match = match.get(pointType);
      if (match === undefined) {
        // No match
        break;
      }
    }
    // console.log(i, match);
    if (match !== undefined) {
      const [prevPrev, prev, thePoint, next, nextNext] = match.direction > 0 ? neighborIndicesForward : reversed(neighborIndicesForward);
      const points = originalPoints;
      const editPoints = temporaryPoints;
      const actionFuncionFactory = actionFunctionFactories[match.action];
      if (actionFuncionFactory === undefined) {
        console.log(`Undefined action function: ${match.action}`);
        continue;
      }
      const actionFunc = actionFuncionFactory(points, prevPrev, prev, thePoint, next, nextNext);
      if (!match.constrain) {
        // transform
        editFuncsTransform.push(transformFunc => {
          const point = actionFunc(transformFunc, points, prevPrev, prev, thePoint, next, nextNext);
          editPoints[thePoint] = point;
          return [thePoint + startPoint, point.x, point.y];
        });
      } else {
        // constrain
        editFuncsConstrain.push(transformFunc => {
          const point = actionFunc(transformFunc, editPoints, prevPrev, prev, thePoint, next, nextNext);
          return [thePoint + startPoint, point.x, point.y];
        });
      }

    }
  }
  return editFuncsTransform.concat(editFuncsConstrain);
}


function boolInt(v) {
  return v ? 1 : 0;
}


function modulo(a, b) {
  // Modulo with Python behavior for negative numbers
  const result = a % b;
  if (result < 0) {
    return result + b;
  }
  return result;
}


const N_TYPES = 7

const SHARP_SELECTED = 0;
const SHARP_UNSELECTED = 1;
const SMOOTH_SELECTED = 2;
const SMOOTH_UNSELECTED = 3;
const OFFCURVE_SELECTED = 4;
const OFFCURVE_UNSELECTED = 5;
const DOESNT_EXIST = 6;


const POINT_TYPES = [
  // usage: POINT_TYPES[smooth][oncurve][selected]

  // sharp
  [
    // off-curve
    [
      OFFCURVE_UNSELECTED,
      OFFCURVE_SELECTED,
    ],
    // on-curve
    [
      SHARP_UNSELECTED,
      SHARP_SELECTED,
    ],
  ],
  // smooth
  [
    // off-curve
    [
      OFFCURVE_UNSELECTED,  // smooth off-curve points don't really exist
      OFFCURVE_SELECTED,  // ditto
    ],
    // on-curve
    [
      SMOOTH_UNSELECTED,
      SMOOTH_SELECTED,
    ],
  ],
];


// Or-able constants for rule definitions
const NIL = 1 << 0;  // Does not exist
const SEL = 1 << 1;  // Selected
const UNS = 1 << 2;  // Unselected
const SHA = 1 << 3;  // Sharp On-Curve
const SMO = 1 << 4;  // Smooth On-Curve
const OFF = 1 << 5;  // Off-Curve
const ANY = SHA | SMO | OFF;

// Some examples:
//     SHA        point must be sharp, but can be selected or not
//     SHA|SMO    point must be either sharp or smooth, but can be selected or not
//     OFF|SEL    point must be off-curve and selected
//     ANY|UNS    point can be off-curve, sharp or smooth, but must not be selected


const defaultRules = [
  //   prevPrev    prev        the point   next        nextNext    Constrain   Action

  // Default rule: if no other rules apply, just move the selected point
  [    ANY|NIL,    ANY|NIL,    ANY|SEL,    ANY|NIL,    ANY|NIL,    false,      "Move"],

  // Off-curve point next to a smooth point next to a selected point
  [    ANY|SEL,    SMO|UNS,    OFF,        OFF|SHA|NIL,ANY|NIL,    true,       "RotateNext"],

  // Selected tangent point: its neighboring off-curve point should move
  [    SHA|SMO,    SMO|SEL,    OFF,        OFF|SHA|NIL,ANY|NIL,    true,       "RotateNext"],

  // Free off-curve point, move with on-curve neighbor
  [    ANY|NIL,    SHA|SEL,    OFF,        OFF|SHA|NIL,ANY|NIL,    false,      "Move"],
  [    OFF,        SMO|SEL,    OFF,        OFF|SHA|NIL,ANY|NIL,    false,      "Move"],

  // An unselected off-curve between two smooth points
  [    ANY|UNS,    SMO|SEL,    OFF,        SMO,        ANY|NIL,    true,       "MoveAndIntersect"],
  [    ANY|SEL,    SMO,        OFF,        SMO,        ANY|NIL,    true,       "MoveAndIntersect"],

  // Tangent bcp constraint
  [    SMO|SHA,    SMO|UNS,    OFF|SEL,    ANY|NIL,    ANY|NIL,    false,      "ConstrainPrevAngle"],

  // Two selected points with an unselected smooth point between them
  [    OFF|SEL,    SMO|UNS,    ANY|SEL,    ANY|NIL,    ANY|NIL,    false,      "ConstrainPrevAngle"],
  [    ANY|SEL,    SMO|UNS,    ANY|SEL,    ANY|NIL,    ANY|NIL,    false,      "ConstrainPrevAngle"],
  [    ANY|SEL,    SMO|UNS,    ANY|SEL,    SMO|UNS,    ANY|SEL,    false,      "DontMove"],
  [    ANY|SEL,    SMO|UNS,    ANY|SEL,    SMO|UNS,    SMO|UNS,    false,      "DontMove"],

];


function convertPointType(matchPoint) {
  const sel = matchPoint & SEL;
  const unsel = matchPoint & UNS;
  const sharp = matchPoint & SHA;
  const smooth = matchPoint & SMO;
  const offcurve = matchPoint & OFF;
  const doesntExist = matchPoint & NIL;

  if (sel && unsel) {
    throw new Error("assert -- can't match matchPoint that is selected and unselected");
  }
  if (!(sharp || smooth || offcurve)) {
    throw new Error("assert -- matchPoint must be at least sharp, smooth or off-curve");
  }

  const pointTypes = [];
  if (doesntExist) {
    pointTypes.push(DOESNT_EXIST);
  }
  if (sharp) {
    if (!unsel) {
      pointTypes.push(SHARP_SELECTED);
    }
    if (!sel) {
      pointTypes.push(SHARP_UNSELECTED);
    }
  }
  if (smooth) {
    if (!unsel) {
      pointTypes.push(SMOOTH_SELECTED);
    }
    if (!sel) {
      pointTypes.push(SMOOTH_UNSELECTED);
    }
  }
  if (offcurve) {
    if (!unsel) {
      pointTypes.push(OFFCURVE_SELECTED);
    }
    if (!sel) {
      pointTypes.push(OFFCURVE_UNSELECTED);
    }
  }
  return pointTypes;
}


function buildPointMatchTable(rules) {
  const matchTable = new Map();
  for (const rule of rules) {
    if (rule.length !== 7) {
      throw new Error("assert -- invalid rule");
    }
    const matchPoints = rule.slice(0, 5);
    const actionForward = {
      "constrain": rule[5],
      "action": rule[6],
      "direction": 1,
    }
    const actionBackward = {
      ...actionForward,
      "direction": -1,
    }
    _fillTable(matchTable, Array.from(reversed(matchPoints)), actionBackward);
    _fillTable(matchTable, matchPoints, actionForward);
  }
  return matchTable;
}


function _fillTable(table, matchPoints, action) {
  const matchPoint = matchPoints[0];
  matchPoints = matchPoints.slice(1);
  for (const pointType of convertPointType(matchPoint)) {
    if (!matchPoints.length) {
      table.set(pointType, action);
    } else {
      if (!table.has(pointType)) {
        table.set(pointType, new Map());
      }
      _fillTable(table.get(pointType), matchPoints, action);
    }
  }
}


const defaultMatchTable = buildPointMatchTable(defaultRules);


const actionFunctionFactories = {

  "DontMove": (points, prevPrev, prev, thePoint, next, nextNext) => {
    return (transformFunc, points, prevPrev, prev, thePoint, next, nextNext) => {
      return points[thePoint];
    };
  },

  "Move": (points, prevPrev, prev, thePoint, next, nextNext) => {
    return (transformFunc, points, prevPrev, prev, thePoint, next, nextNext) => {
      return transformFunc(points[thePoint]);
    };
  },

  "RotateNext": (points, prevPrev, prev, thePoint, next, nextNext) => {
    const handle = subPoints(points[thePoint], points[prev]);
    const handleLength = Math.hypot(handle.x, handle.y);
    return (transformFunc, points, prevPrev, prev, thePoint, next, nextNext) => {
      const delta = subPoints(points[prev], points[prevPrev]);
      const angle = Math.atan2(delta.y, delta.x);
      const handlePoint = {
        "x": points[prev].x + handleLength * Math.cos(angle),
        "y": points[prev].y + handleLength * Math.sin(angle),
      }
      return handlePoint;
    };
  },

  "ConstrainPrevAngle": (points, prevPrev, prev, thePoint, next, nextNext) => {
    const pt1 = points[prevPrev]
    const pt2 = points[prev];
    const perpVector = rotate90CW(subPoints(pt2, pt1));
    return (transformFunc, points, prevPrev, prev, thePoint, next, nextNext) => {
      let point = transformFunc(points[thePoint]);
      const [intersection, t1, t2] = intersect(pt1, pt2, point, addPoints(point, perpVector));
      return intersection;
    };
  },

}


function addPoints(pointA, pointB) {
  return {"x": pointA.x + pointB.x, "y": pointA.y + pointB.y};
}


function subPoints(pointA, pointB) {
  return {"x": pointA.x - pointB.x, "y": pointA.y - pointB.y};
}


function mulPoint(point, scalar) {
  return {"x": point.x * scalar, "y": point.y * scalar};
}


function rotate90CW(vector) {
  return {"x": vector.y, "y": -vector.x};
}


const _EPSILON = 1e-10;


function intersect(pt1, pt2, pt3, pt4) {
  // Return the intersection point of pt1-pt2 and pt3-pt4 as well as
  // two 't' values, indicating where the intersection is relatively to
  // the input lines, like so:
  //         if 0 <= t1 <= 1:
  //                 the intersection lies between pt1 and pt2
  //         elif t1 < 0:
  //                 the intersection lies between before pt1
  //         elif t1 > 1:
  //                 the intersection lies between beyond pt2
  // Similarly for t2 and pt3-pt4.
  // Return (None, 0, 0) if there is no intersection.
  let intersection, t1, t2;
  const delta1 = subPoints(pt2, pt1);
  const delta2 = subPoints(pt4, pt3);
  const determinant = (delta2.y*delta1.x - delta2.x*delta1.y);
  if (Math.abs(determinant) > _EPSILON) {
    t1 = ((pt3.x - pt1.x)*delta2.y + (pt1.y - pt3.y)*delta2.x) / determinant;
    t2 = ((pt1.x - pt3.x)*delta1.y + (pt3.y - pt1.y)*delta1.x) / -determinant;
    intersection = addPoints(mulPoint(delta1, t1), pt1);
  }
  return [intersection, t1, t2];
}
