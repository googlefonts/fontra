import { joinPaths } from "./var-glyph.js";
import { mapFromUserSpace, normalizeLocation } from "./var-model.js";


export class CachingFont {

  constructor (font, location) {
    this.font = font;
    this.location = location;
    this._glyphDependencies = {};
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
    for (const dependantName of this._glyphDependencies[glyphName] || []) {
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
        if (!await this.font.hasGlyph(glyphName)) {
          return null;
        }
        const cachingInstance = new CachingGlyphInstance(
          glyphName, this.font, this.location, await this.getSourceIndex(glyphName),
        );
        await cachingInstance.initialize();
        for (const componentName of cachingInstance.componentNames || []) {
          if (!this._glyphDependencies[componentName]) {
            this._glyphDependencies[componentName] = new Set();
          }
          this._glyphDependencies[componentName].add(glyphName);
        }
        this._loadedGlyphInstances[glyphName] = true;
        return cachingInstance;
      })();
      this._glyphInstancePromiseCache[glyphName] = glyphInstancePromise;
    }
    return glyphInstancePromise;
  }

  async getSourceIndex(glyphName) {
    if (!(glyphName in this._sourceIndices)) {
      const glyph = await this.font.getGlyph(glyphName);
      this._sourceIndices[glyphName] = findSourceIndexFromLocation(glyph, this.location);
    }
    return this._sourceIndices[glyphName];
  }

}


class CachingGlyphInstance {

  constructor(name, font, location, sourceIndex) {
    this.name = name;
    this.font = font;
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
    const glyph = await this.font.getGlyph(this.name);
    const location = mapNLILocation(this.location, glyph.axes);
    if (this.sourceIndex !== undefined) {
      this.instance = glyph.sources[this.sourceIndex].source;
    } else {
      this.instance = await glyph.instantiate(location);
    }

    const getGlyphFunc = this.font.getGlyph.bind(this.font);
    this.components = [];
    for (const compo of this.instance.components) {
      this.components.push(
        new CachingComponent(await compo.getPath(getGlyphFunc, location))
      );
    }
    this.componentNames = glyph.componentNames;
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
      if (!baseName in nliAxes) {
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
  const allAxes = glyph.globalAxes.concat(glyph.axes);  // XXX overlapping axes?!
  location = mapFromUserSpace(location, glyph.globalAxes);
  for (let i = 0; i < glyph.sources.length; i++) {
    const source = glyph.sources[i];
    let found = true;
    for (const axis of allAxes) {
      const baseName = getAxisBaseName(axis.name);
      let varValue = location[baseName];
      let sourceValue = source.location[axis.name];
      if (varValue === undefined) {
        varValue = axis.defaultValue;
      }
      if (sourceValue === undefined) {
        sourceValue = axis.defaultValue;
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
