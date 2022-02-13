import {
  VariationModel,
  locationToString,
  mapForward,
  mapBackward,
  normalizeLocation,
  piecewiseLinearMap,
} from "./var-model.js";


export class VariableGlyphController {

  constructor(glyph, globalAxes) {
    this.glyph = glyph;
    this.globalAxes = globalAxes;
    this._locationToSourceIndex = {};
  }

  get axes() {
    return this.glyph.axes;
  }

  get sources() {
    return this.glyph.sources;
  }

  getSourceIndex(location) {
    const locationStr = locationToString(location);
    if (!(locationStr in this._locationToSourceIndex)) {
      this._locationToSourceIndex[locationStr] = this._getSourceIndex(location);
    }
    return this._locationToSourceIndex[locationStr];
  }

  _getSourceIndex(location) {
    location = mapForward(location, this.globalAxes);
    location = mapBackward(location, this.getLocalToGlobalMapping());
    for (let i = 0; i < this.sources.length; i++) {
      const source = this.sources[i];
      let found = true;
      for (const [axisName, triple] of Object.entries(this.axisDictLocal)) {
        const baseName = getAxisBaseName(axisName);
        let varValue = location[baseName];
        let sourceValue = source.location[axisName];
        if (varValue === undefined) {
          varValue = triple[1];
        }
        if (sourceValue === undefined) {
          sourceValue = triple[1];
        }
        if (varValue !== sourceValue) {
          found = false;
          break;
        }
      }
      if (found) {
        return i;
      }
    }
    return undefined;
  }

  getAllComponentNames() {
    // Return a set of all component names used by all layers of all sources
    const componentNames = new Set();
    for (const source of this.glyph.sources) {
      for (const layer of source.layers) {
        for (const component of layer.glyph.components) {
          componentNames.add(component.name);
        }
      }
    }
    return componentNames;
  }

  getLocalToGlobalMapping() {
    const pseudoAxisList = [];
    for (const [axisName, localTriple] of Object.entries(this.axisDictLocal)) {
      const globalTriple = this.axisDictGlobal[axisName];
      const mapping = [];
      for (let i = 0; i < 3; i++) {
        mapping.push([localTriple[i], globalTriple[i]]);
      }
      pseudoAxisList.push({"name": axisName, "mapping": mapping});
    }
    return pseudoAxisList;
  }

  clearDeltasCache() {
    delete this._deltas;
  }

  get model() {
    if (this._model === undefined) {
      const locations = this.sources.map(source => source.location);
      this._model = new VariationModel(
        locations.map(location => normalizeLocationSparse(location, this.axisDictLocal)),
        this.axes.map(axis => axis.name));
    }
    return this._model;
  }

  get deltas() {
    if (this._deltas === undefined) {
      const masterValues = this.sources.map(source => source.sourceGlyph);
      this._deltas = this.model.getDeltas(masterValues);
    }
    return this._deltas;
  }

  get axisDictGlobal() {
    if (this._axisDictGlobal === undefined) {
      this._axisDictGlobal = this._combineGlobalAndLocalAxes(false);
    }
    return this._axisDictGlobal;
  }

  get axisDictLocal() {
    if (this._axisDictLocal === undefined) {
      this._axisDictLocal = this._combineGlobalAndLocalAxes(true);
    }
    return this._axisDictLocal;
  }

  _combineGlobalAndLocalAxes(prioritizeLocal) {
    const usedAxisNames = new Set(
      this.sources.reduce((prev, cur) => prev.concat(Object.keys(cur.location)), [])
    );
    const axisDict = {};
    for (const axis of this.globalAxes) {
      if (usedAxisNames.has(axis.name)) {
        const m = makeAxisMapFunc(axis);
        axisDict[axis.name] = [axis.minValue, axis.defaultValue, axis.maxValue].map(m);
      }
    }
    for (const axis of this.axes) {
      if (prioritizeLocal || !(axis.name in axisDict)) {
        axisDict[axis.name] = [axis.minValue, axis.defaultValue, axis.maxValue];
      }
    }
    return axisDict;
  }

  instantiate(location, fromGlobal = true) {
    const axisDict = fromGlobal ? this.axisDictGlobal : this.axisDictLocal;
    return this.model.interpolateFromDeltas(
      normalizeLocation(location, axisDict), this.deltas
    );
  }

}


function makeAxisMapFunc(axis) {
  if (!axis.mapping) {
    return v => v;
  }
  const mapping = Object.fromEntries(axis.mapping);
  return v => piecewiseLinearMap(v, mapping);
}


function normalizeLocationSparse(location, axes) {
  const normLoc = normalizeLocation(location, axes);
  for (const [name, value] of Object.entries(normLoc)) {
    if (!value) {
      delete normLoc[name];
    }
  }
  return normLoc;
}


export function getAxisBaseName(axisName) {
  return axisName.split("*", 1)[0];
}
