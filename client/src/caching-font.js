import { flattenComponentPaths, joinPaths } from "./var-glyph.js";


export class CachingFont {

  constructor (font, location) {
    this.font = font;
    this.location = location;
    this._glyphInstancePromiseCache = {};
    this._loadedGlyphInstances = {};
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
        const cachingInstance = new CachingGlyphInstance(glyphName, this.font, this.location);
        await cachingInstance.initialize();
        this._loadedGlyphInstances[glyphName] = true;
        return cachingInstance;
      })();
      this._glyphInstancePromiseCache[glyphName] = glyphInstancePromise;
    }
    return glyphInstancePromise;
  }

}


class CachingGlyphInstance {

  constructor(name, font, location) {
    this.name = name;
    this.font = font;
    this.location = location;
  }

  async initialize() {
    const glyph = await this.font.getGlyph(this.name);
    const location = mapNLILocation(this.location, glyph.axes);
    this.instance = await glyph.instantiate(location);
    const componentPaths = await this.instance.getComponentPaths(
      async glyphName => await this.font.getGlyph(glyphName),
      location,
    )
    this.components = componentPaths.map(item => new CachingComponent(flattenComponentPaths(item)));
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


export function mapNLILocation(userLocation, axes) {
  const location = {};
  for (const axis of axes) {
    const baseName = axis.name.split("*", 1)[0];
    const value = userLocation[baseName];
    if (value !== undefined) {
      location[axis.name] = value;
    }
  }
  return location;
}
