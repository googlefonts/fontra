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
      if (!this._locationIndices[key]) {
        this._locationIndices[key] = [index];
      } else {
        this._locationIndices[key].push(index);
      }
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
    const splitLoc = splitDiscreteLocation(location, this._discreteAxes);
    const key = JSON.stringify(splitLoc.discreteLocation);
    const model = this._getModel(key);
    const contributions = model.getSourceContributions(
      normalizeLocation(splitLoc.location, this._continuousAxes)
    );
    let index = 0;
    return this._locationKeys.map((k) => (k === key ? contributions[index++] : null));
  }
}

function splitDiscreteLocation(location, discreteAxes) {
  const discreteLocation = {};
  location = { ...location };
  for (const axis of discreteAxes) {
    let value = location[axis.name];
    if (value !== undefined) {
      delete location[axis.name];
      if (axis.values.indexOf(value) < 0) {
        // Ensure the value is actually in the values list
        value = findNearest(value, axis.values);
      }
    } else {
      value = axis.defaultValue;
    }
    discreteLocation[axis.name] = value;
  }
  return { discreteLocation, location };
}

function findNearest(value, values) {
  if (!values.length) {
    return value;
  }
  const decorated = values.map((v) => [Math.abs(v - value), v]);
  decorated.sort((a, b) => a[0] - b[0]);
  return decorated[0][1];
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
