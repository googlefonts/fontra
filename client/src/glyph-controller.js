import { joinPaths } from "./var-glyph.js";
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

  get name() {
    return this.glyph.name;
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

  async instantiateController(location, getGlyphFunc) {
    const sourceIndex = this.getSourceIndex(location);
    location = mapForward(mapNLILocation(location, this.axes), this.globalAxes);
    let instance;
    if (sourceIndex !== undefined) {
      instance = this.sources[sourceIndex].sourceGlyph;
    } else {
      instance = this.instantiate(location);
    }

    const components = [];
    for (const compo of instance.components) {
      components.push(
        new CachingComponent(await compo.getPath(getGlyphFunc, location))
      );
    }
    const instanceController = new StaticGlyphController(
      this.name, instance, components, this.location, sourceIndex,
    );
    return instanceController;
  }

}


class StaticGlyphController {

  constructor(name, instance, components, location, sourceIndex) {
    this.name = name;
    this.instance = instance;
    this.components = components;
    this.location = location;
    this.sourceIndex = sourceIndex;
  }

  clearCache() {
    delete this._flattenedPath;
    delete this._flattenedPath2d;
    delete this._path2d;
    delete this._componentsPath;
    delete this._componentsPath2d;
    delete this._controlBounds;
    delete this._convexHull;
  }

  get canEdit() {
    return this.sourceIndex !== undefined;
  }

  get xAdvance() {
    return this.instance.xAdvance;
  }

  get yAdvance() {
    return this.instance.yAdvance;
  }

  get verticalOrigin() {
    return this.instance.verticalOrigin;
  }

  get flattenedPath() {
    if (this._flattenedPath === undefined) {
      this._flattenedPath = joinPaths([this.instance.path, this.componentsPath]);
    }
    return this._flattenedPath;
  }

  get flattenedPath2d() {
    if (this._flattenedPath2d === undefined) {
      this._flattenedPath2d = new Path2D();
      this.flattenedPath.drawToPath2d(this._flattenedPath2d);
    }
    return this._flattenedPath2d;
  }

  get path() {
    return this.instance.path;
  }

  get path2d() {
    if (this._path2d === undefined) {
      this._path2d = new Path2D();
      this.instance.path.drawToPath2d(this._path2d);
    }
    return this._path2d;
  }

  get componentsPath() {
    if (this._componentsPath === undefined) {
      this._componentsPath = joinPaths(this.components.map(compo => compo.path));
    }
    return this._componentsPath;
  }

  get componentsPath2d() {
    if (this._componentsPath2d === undefined) {
      this._componentsPath2d = new Path2D();
      this.componentsPath?.drawToPath2d(this._componentsPath2d);
    }
    return this._componentsPath2d;
  }

  get controlBounds() {
    if (this._controlBounds === undefined) {
      this._controlBounds = this.flattenedPath.getControlBounds();
    }
    return this._controlBounds;
  }

  get convexHull() {
    if (this._convexHull === undefined) {
      this._convexHull = this.flattenedPath.getConvexHull();
    }
    return this._convexHull;
  }

}


class CachingComponent {

  constructor(path) {
    this.path = path;
  }

  get path2d() {
    if (this._path2d === undefined) {
      this._path2d = new Path2D();
      this.path.drawToPath2d(this._path2d);
    }
    return this._path2d;
  }

  get controlBounds() {
    if (this._controlBounds === undefined) {
      this._controlBounds = this.path.getControlBounds();
    }
    return this._controlBounds;
  }

  get convexHull() {
    if (this._convexHull === undefined) {
      this._convexHull = this.path.getConvexHull();
    }
    return this._convexHull;
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


function mapNLILocation(userLocation, axes) {
  const nliAxes = {};
  for (const axis of axes) {
    const baseName = axis.name.split("*", 1)[0];
    if (baseName !== axis.name) {
      if (!(baseName in nliAxes)) {
        nliAxes[baseName] = [];
      }
      nliAxes[baseName].push(axis.name);
    }
  }
  const location = {};
  for (const [baseName, value] of Object.entries(userLocation)) {
    for (const realName of nliAxes[baseName] || [baseName]) {
      location[realName] = value;
    }
  }
  return location;
}
