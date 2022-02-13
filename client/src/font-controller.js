import { LRUCache } from "./lru-cache.js";
import { joinPaths } from "./var-glyph.js";
import { mapBackward, mapForward, normalizeLocation } from "./var-model.js";


export class FontController {

  constructor (font, location) {
    this.font = font;
    this.location = location;
    this._glyphsPromiseCache = new LRUCache(250);
    this.glyphDependencies = {};
  }

  async initialize() {
    this.reversedCmap = await this.font.getReversedCmap();
    this.cmap = makeCmapFromReversedCmap(this.reversedCmap);
    this.globalAxes = await this.font.getGlobalAxes();
  }

  codePointForGlyph(glyphName) {
    const reversedCmap = this.reversedCmap;
    const cmap = this.cmap;
    for (const codePoint of reversedCmap[glyphName] || []) {
      if (cmap[codePoint] === glyphName) {
        return codePoint;
      }
    }
    return undefined;
  }

  async hasGlyph(glyphName) {
    return glyphName in this.reversedCmap;
  }

  getGlyph(glyphName) {
    let glyphPromise = this._glyphsPromiseCache.get(glyphName);
    if (glyphPromise === undefined) {
      glyphPromise = (async () => {
        if (!await this.hasGlyph(glyphName)) {
          return null;
        }
        let glyph = await this.font.getGlyph(glyphName);
        if (glyph !== null) {
          glyph = new VariableGlyphController(glyph, this.globalAxes);
          for (const componentName of glyph.getAllComponentNames()) {
            if (!this.glyphDependencies[componentName]) {
              this.glyphDependencies[componentName] = new Set();
            }
            this.glyphDependencies[componentName].add(glyphName);
          }
        }
        return glyph;
      })();
      this._glyphsPromiseCache.put(glyphName, glyphPromise);
      // console.log("LRU size", this._glyphsPromiseCache.map.size);
    }
    return glyphPromise;
  }

  get location() {
    return this._location;
  }

  set location(location) {
    this._location = location;
    this._glyphInstancePromiseCache = {};
    this._loadedGlyphInstances = {};
    this._sourceIndices = {};
  }

  clearGlyphCache(glyphName) {
    delete this._glyphInstancePromiseCache[glyphName];
    delete this._loadedGlyphInstances[glyphName];
    delete this._sourceIndices[glyphName];
    for (const dependantName of this.glyphDependencies[glyphName] || []) {
      this.clearGlyphCache(dependantName);
    }
  }

  isGlyphInstanceLoaded(glyphName) {
    return glyphName in this._loadedGlyphInstances;
  }

  getGlyphInstance(glyphName) {
    let glyphInstancePromise = this._glyphInstancePromiseCache[glyphName];
    if (glyphInstancePromise === undefined) {
      glyphInstancePromise = (async () => {
        if (!await this.hasGlyph(glyphName)) {
          return null;
        }
        const cachingInstance = new CachingGlyphInstance(
          glyphName, this, this.location, await this.getSourceIndex(glyphName),
        );
        await cachingInstance.initialize();
        this._loadedGlyphInstances[glyphName] = true;
        return cachingInstance;
      })();
      this._glyphInstancePromiseCache[glyphName] = glyphInstancePromise;
    }
    return glyphInstancePromise;
  }

  async getSourceIndex(glyphName) {
    if (!(glyphName in this._sourceIndices)) {
      const glyph = await this.getGlyph(glyphName);
      this._sourceIndices[glyphName] = findSourceIndexFromLocation(glyph, this.location);
    }
    return this._sourceIndices[glyphName];
  }

}


class VariableGlyphController {

  constructor(glyph, globalAxes) {
    this.glyph = glyph;
    this.globalAxes = globalAxes;
    this.glyph.globalAxes = globalAxes;  // XXX should go away
  }

  get axes() {
    return this.glyph.axes;
  }

  get sources() {
    return this.glyph.sources;
  }

  get axisDictLocal() {
    return this.glyph.axisDictLocal;
  }

  get axisDictGlobal() {
    return this.glyph.axisDictGlobal;
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
    for (const [axisName, localTriple] of Object.entries(this.glyph.axisDictLocal)) {
      const globalTriple = this.glyph.axisDictGlobal[axisName];
      const mapping = [];
      for (let i = 0; i < 3; i++) {
        mapping.push([localTriple[i], globalTriple[i]]);
      }
      pseudoAxisList.push({"name": axisName, "mapping": mapping});
    }
    return pseudoAxisList;
  }

  clearDeltasCache() {
    delete this.glyph._deltas;
  }

  instantiate(location) {
    return this.glyph.instantiate(location);
  }

}

class CachingGlyphInstance {

  constructor(name, fontController, location, sourceIndex) {
    this.name = name;
    this.fontController = fontController;
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

  async initialize() {
    const glyph = await this.fontController.getGlyph(this.name);
    const location = mapForward(mapNLILocation(this.location, glyph.axes), glyph.globalAxes);
    if (this.sourceIndex !== undefined) {
      this.instance = glyph.sources[this.sourceIndex].sourceGlyph;
    } else {
      this.instance = await glyph.instantiate(location);
    }

    const getGlyphFunc = this.fontController.getGlyph.bind(this.fontController);
    this.components = [];
    for (const compo of this.instance.components) {
      this.components.push(
        new CachingComponent(await compo.getPath(getGlyphFunc, location))
      );
    }
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


export function getAxisBaseName(axisName) {
  return axisName.split("*", 1)[0];
}


function findSourceIndexFromLocation(glyph, location) {
  location = mapForward(location, glyph.globalAxes);
  location = mapBackward(location, glyph.getLocalToGlobalMapping());
  for (let i = 0; i < glyph.sources.length; i++) {
    const source = glyph.sources[i];
    let found = true;
    for (const [axisName, triple] of Object.entries(glyph.axisDictLocal)) {
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


function findClosestSourceIndexFromLocation(glyph, location) {
  const axisDict = {};
  for (const axis of glyph.axes) {
    axisDict[axis.name] = [axis.minValue, axis.defaultValue, axis.maxValue];
  }
  location = normalizeLocation(location, axisDict);
  const distances = [];
  for (let i = 0; i < glyph.sources.length; i++) {
    const sourceLocation = normalizeLocation(glyph.sources[i].location, axisDict);
    let distanceSquared = 0;
    for (const [axisName, value] of Object.entries(location)) {
      const sourceValue = sourceLocation[axisName];
      distanceSquared += (sourceValue - value) ** 2;
    }
    distances.push([distanceSquared, i]);
    if (distanceSquared === 0) {
      // exact match, no need to look further
      break;
    }
  }
  distances.sort((a, b) => {
    const da = a[0];
    const db = b[0];
    return (a > b) - (a < b);
  });
  return {distance: Math.sqrt(distances[0][0]), index: distances[0][1]}
}


function makeCmapFromReversedCmap(reversedCmap) {
  const cmap = {};
  for (const [glyphName, codePoints] of Object.entries(reversedCmap)) {
    for (const codePoint of codePoints) {
      const mappedGlyphName = cmap[codePoint];
      if (mappedGlyphName !== undefined && glyphName > mappedGlyphName) {
        continue;
      }
      cmap[codePoint] = glyphName;
    }
  }
  return cmap;
}
