import { VariableGlyphController } from "./glyph-controller.js";
import { LRUCache } from "./lru-cache.js";
import { mapForward, normalizeLocation } from "./var-model.js";


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
  }

  clearGlyphCache(glyphName) {
    delete this._glyphInstancePromiseCache[glyphName];
    delete this._loadedGlyphInstances[glyphName];
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
        const varGlyph = await this.getGlyph(glyphName);
        const getGlyphFunc = this.getGlyph.bind(this);
        const instanceController = await varGlyph.instantiateController(this.location, getGlyphFunc);
        this._loadedGlyphInstances[glyphName] = true;
        return instanceController;
      })();
      this._glyphInstancePromiseCache[glyphName] = glyphInstancePromise;
    }
    return glyphInstancePromise;
  }

  async getSourceIndex(glyphName) {
    const glyph = await this.getGlyph(glyphName);
    return glyph.getSourceIndex(this.location);
  }

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
