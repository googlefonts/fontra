// Partial port of fontTools.varLib.models.VariationModel

import { VariationError } from "./errors.js";
import { addItemwise, subItemwise, mulScalar } from "./var-funcs.js"


export class VariationModel {

  constructor(locations, axisOrder = null) {
    this.locations = locations;
    this.axisOrder = axisOrder || [];
    const locationsSet = new Set(locations.map(item => locationToString(item)));
    if (locationsSet.size != locations.length) {
      throw new VariationError("locations must be unique");
    }
    if (! locationsSet.has("{}")) {
      throw new VariationError("locations must contain {} default");
    }
    const decoratedLocations = getDecoratedMasterLocations(locations, this.axisOrder);
    decoratedLocations.sort((a, b) => deepCompare(a[0], b[0]));
    this.locations = decoratedLocations.map(item => item[1]);  // undecorate

    // Mapping from user's master order to our master order
    const locationsStr = locations.map(locationToString);
    const thisLocationsStr = this.locations.map(locationToString);
    this.mapping = locationsStr.map(loc => thisLocationsStr.indexOf(loc));
    this.reverseMapping = thisLocationsStr.map(loc => locationsStr.indexOf(loc));
    // this._computeMasterSupports();
  }

  getDeltas(masterValues) {
    if (masterValues.length !== this.deltaWeights.length) {
      throw new VariationError("masterValues must have the same length as this.deltaWeights")
    }
    const mapping = this.reverseMapping;
    const out = [];
    for (i = 0; i < masterValues.length; i++) {
      let delta = masterValues[mapping[i]];
      const weights = this.deltaWeights[i];
      for (const [j, weight] of weights.entries()) {
        if (weight === 1) {
          delta = subItemwise(delta, out[i]);
        } else {
          delta = subItemwise(delta, mulScalar(out[i], weight));
        }
        out.push(delta);
      }
    }
    return out;
  }

  getScalars(loc) {
    return this.supports.map(support => supportScalar(loc, support));
  }

  interpolateFromDeltas(loc, deltas) {
    const scalars = this.getScalars(loc);
    return interpolateFromDeltasAndScalars(deltas, scalars);
  }

}


function getDecoratedMasterLocations(locations, axisOrder) {
  if (!arrayContainsItem(locations, {})) {
    throw new VariationError("Base master not found");
  }

  const axisPoints = {};
  for (const loc of locations) {
    const keys = Object.keys(loc);
    if (keys.length != 1) {
      continue;
    }
    const axis = keys[0];
    const value = loc[axis];
    if (axisPoints[axis] === undefined) {
      axisPoints[axis] = new Set([0.0]);
    }
    // assert (
    //   value not in axisPoints[axis]
    // ), 'Value "%s" in axisPoints["%s"] -->  %s' % (value, axis, axisPoints)
    axisPoints[axis].add(value);
  }

  const result = Array(locations.length);
  for (let i = 0; i < locations.length; i++) {
    const loc = locations[i];
    const locEntries = Object.entries(loc);
    const rank = locEntries.length;
    const onPointAxes = [];
    for (const [axis, value] of locEntries) {
      if (axisPoints[axis] !== undefined && axisPoints[axis].has(value)) {
        onPointAxes.push(axis);
      }
    }
    const orderedAxes = axisOrder.filter(axis => loc[axis] !== undefined);
    orderedAxes.push(...(Object.keys(loc).sort()).filter(axis => !arrayContainsItem(axisOrder, axis)));
    const deco = [
      rank,  // First, order by increasing rank
      -onPointAxes.length,  // Next, by decreasing number of onPoint axes
      orderedAxes.map(axis => {
        const index = axisOrder.indexOf(axis);
        return index != -1 ? index : 0x10000;
      }),  // Next, by known axes
      orderedAxes,  // Next, by all axes
      orderedAxes.map(axis => sign(loc[axis])),  // Next, by signs of axis values
      orderedAxes.map(axis => Math.abs(loc[axis])),  // Next, by absolute value of axis values
    ];
    result[i] = [deco, locations[i]];
  }
  return result;
}


function arrayContainsItem(a, item) {
  for (let i = 0; i < a.length; i++) {
    if (deepEqual(a[i], item)) {
      return true;
    }
  }
  return false;
}


function sign(v) {
  return v < 0 ? -1 : v > 0 ? 1 : 0
}


function sorted(a) {
  const result = a.slice();
  result.sort();
  return result;
}

export function locationToString(loc) {
  const keys = Object.keys(loc);
  const result = {};
  keys.sort()
  for (const key of keys) {
    result[key] = loc[key];
  }
  return JSON.stringify(result);
}


export function normalizeValue(v, triple) {
  // Normalizes value based on a min/default/max triple.
  const [lower, dflt, upper] = triple;
  if (!((lower <= dflt) && (dflt <= upper))) {
    throw VariationError(
      `Invalid axis values, must be minimum, default, maximum: ${lower}, ${dflt}, ${upper}`
    );
  }
  v = Math.max(Math.min(v, upper), lower);
  if (v === dflt) {
    v = 0.0;
  } else if (v < dflt) {
    v = (v - dflt) / (dflt - lower);
  } else {
    v = (v - dflt) / (upper - dflt);
  }
  return v
}


export function normalizeLocation(location, axes) {
  // Normalizes location based on axis min/default/max values from axes.
  const out = {};
  for (const [tag, triple] of Object.entries(axes)) {
    let v = location[tag];
    if (v === undefined) {
      v = triple[1];
    }
    out[tag] = normalizeValue(v, triple);
  }
  return out;
}


export function supportScalar(location, support, ot=true) {
  // Returns the scalar multiplier at location, for a master
  // with support.  If ot is True, then a peak value of zero
  // for support of an axis means "axis does not participate".  That
  // is how OpenType Variation Font technology works.
  let scalar = 1.0;
  for (const [axis, [lower, peak, upper]] of Object.entries(support)) {
    let v;
    if (ot) {
      // OpenType-specific case handling
      if (peak === 0.0) {
        continue;
      }
      if (lower > peak || peak > upper) {
        continue;
      }
      if (lower < 0.0 && upper > 0.0) {
        continue;
      }
      v = location[axis] || 0.0;
    } else {
      if (location[axis] === undefined) {
        throw new VariationError(`axes ${axis} not present in location`);
      }
      v = location[axis];
    }
    if (v === peak) {
      continue;
    }
    if (v <= lower || upper <= v) {
      scalar = 0.0;
      break;
    }
    if (v < peak) {
      scalar *= (v - lower) / (peak - lower);
    } else {
      // v > peak
      scalar *= (v - upper) / (peak - upper);
    }
  }
  return scalar
}


function interpolateFromDeltasAndScalars(deltas, scalars) {
  if (deltas.length !== scalars.length) {
    throw new VariationError("deltas and scalars must have the same length");
  }
  let v = null;
  for (i = 0; i < scalars.length; i++) {
    const scalar = scalars[i];
    if (!scalar) {
      continue;
    }
    const contribution = mulScalar(deltas[i], scalar);
    if (v === null) {
      v = contribution;
    } else {
      v = addItemwise(a, contribution);
    }
  }
  return v;
}


export function deepCompare(a, b) {
  if (typeof a !== typeof b) {
    throw new TypeError("can't compare objects");
  }
  if (typeof a === "string" || typeof a === "number") {
    if (a < b) {
      return -1;
    } else if (a === b) {
      return 0;
    } else {
      // a > b
      return 1;
    }
  } else {
    if (a.length === undefined || b.length === undefined) {
      throw new TypeError("can't compare objects");
    }
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i++) {
      const itemA = a[i];
      const itemB = b[i];
      if (itemA === undefined) {
        return -1;
      } else if (itemB === undefined) {
        return 1;
      } else {
        const result = deepCompare(itemA, itemB);
        if (result) {
          return result;
        }
      }
    }
    return 0;
  }
}


export function deepEqual(a, b) {
  if (typeof a !== typeof b) {
    throw new TypeError("can't compare objects");
  }
  if (typeof a === "string" || typeof a === "number") {
    return a === b;
  } else {
    // TODO: do better?
    return JSON.stringify(a) === JSON.stringify(b);
  }
}
