import { reversed } from "../core/utils.js";


// Or-able constants for rule definitions
export const NIL = 1 << 0;  // Does not exist
export const SEL = 1 << 1;  // Selected
export const UNS = 1 << 2;  // Unselected
export const SHA = 1 << 3;  // Sharp On-Curve
export const SMO = 1 << 4;  // Smooth On-Curve
export const OFF = 1 << 5;  // Off-Curve
export const ANY = SHA | SMO | OFF;

// Some examples:
//     SHA        point must be sharp, and can be selected or not
//     SHA|SMO    point must be either sharp or smooth, and can be selected or not
//     OFF|SEL    point must be off-curve and selected
//     ANY|UNS    point can be off-curve, sharp or smooth, and must not be selected


const SHARP_SELECTED = 0;
const SHARP_UNSELECTED = 1;
const SMOOTH_SELECTED = 2;
const SMOOTH_UNSELECTED = 3;
const OFFCURVE_SELECTED = 4;
const OFFCURVE_UNSELECTED = 5;
const DOESNT_EXIST = 6;


export const POINT_TYPES = [
  // usage: POINT_TYPES[smooth][oncurve][selected]

  // sharp
  [
    // off-curve
    [OFFCURVE_UNSELECTED, OFFCURVE_SELECTED],
    // on-curve
    [SHARP_UNSELECTED, SHARP_SELECTED],
  ],
  // smooth
  [
    // off-curve
    [OFFCURVE_UNSELECTED, OFFCURVE_SELECTED],  // smooth off-curve points don't really exist
    // on-curve
    [SMOOTH_UNSELECTED, SMOOTH_SELECTED],
  ],
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


export function buildPointMatchTable(rules) {
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
    populateTable(matchTable, Array.from(reversed(matchPoints)), actionBackward);
    populateTable(matchTable, matchPoints, actionForward);
  }
  return matchTable;
}


function populateTable(table, matchPoints, action) {
  const matchPoint = matchPoints[0];
  matchPoints = matchPoints.slice(1);
  const isLeafNode = !matchPoints.length;
  for (const pointType of convertPointType(matchPoint)) {
    if (isLeafNode) {
      table.set(pointType, action);
    } else {
      let subTable = table.get(pointType);
      if (!subTable) {
        subTable = new Map();
        table.set(pointType, subTable);
      }
      populateTable(subTable, matchPoints, action);
    }
  }
}
