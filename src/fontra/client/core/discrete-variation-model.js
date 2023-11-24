import { enumerate, product, range, zip } from "./utils.js";
import { VariationModel, normalizeLocation } from "./var-model.js";

export class DiscreteVariationModel {
  constructor(locations, discreteAxes, continuousAxes) {
    this._discreteAxes = discreteAxes;
    this._continuousAxes = continuousAxes;
    this._locations = {};
    this._locationKeys = [];
    this._locationIndices = {};
    for (const [index, location] of enumerate(locations)) {
      const splitLoc = splitDiscreteLocation(location, discreteAxes);
      const key = JSON.stringify(splitLoc.discreteLocation);
      this._locationKeys.push(key);
      this._locationIndices[key] = index;
      const normalizedLocation = sparsifyLocation(
        normalizeLocation(splitLoc.location, continuousAxes)
      );
      if (!(key in this._locations)) {
        this._locations[key] = [normalizedLocation];
      } else {
        this._locations[key].push(normalizedLocation);
      }
    }
    this._models = {};

    // XXXXX for contribution
    this.mapping = [...range(locations.length)];
    this.reverseMapping = [...range(locations.length)];
  }

  getDeltas(sourceValues) {
    const sources = {};
    for (const [key, value] of zip(this._locationKeys, sourceValues)) {
      if (!(key in sources)) {
        sources[key] = [value];
      } else {
        sources[key].push(value);
      }
    }
    return { sources, deltas: {} };
  }

  _getModel(key) {
    let model = this._models[key];
    if (!model) {
      model = new VariationModel(this._locations[key]);
      this._models[key] = model;
    }
    return model;
  }

  interpolateFromDeltas(location, deltas) {
    const splitLoc = splitDiscreteLocation(location, this._discreteAxes);
    const key = JSON.stringify(splitLoc.discreteLocation);
    const model = this._getModel(key);
    if (!(key in deltas.deltas)) {
      deltas.deltas[key] = model.getDeltas(deltas.sources[key]);
    }
    return model.interpolateFromDeltas(
      normalizeLocation(splitLoc.location, this._continuousAxes),
      deltas.deltas[key]
    );
  }

  getSourceContributions(location) {
    // XXXX TODO
    return this._locationKeys.map((key) => 0);
  }
}

function splitDiscreteLocation(location, discreteAxes) {
  const discreteLocation = {};
  location = { ...location };
  for (const axis of discreteAxes) {
    if (axis.name in location) {
      discreteLocation[axis.name] = location[axis.name];
      delete location[axis.name];
    } else {
      discreteLocation[axis.name] = axis.defaultValue;
    }
  }
  return { discreteLocation, location };
}

function getAllDiscreteLocations(discreteAxes) {
  const descreteLocations = [
    ...product(...discreteAxes.map((axis) => axis.values.map((v) => [axis.name, v]))),
  ];
  return descreteLocations.map((locs) => Object.fromEntries(locs));
}

export function sparsifyLocation(location) {
  // location must be normalized
  const sparseLocation = {};
  for (const [name, value] of Object.entries(location)) {
    if (value) {
      sparseLocation[name] = value;
    }
  }
  return sparseLocation;
}
