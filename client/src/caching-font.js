import { flattenComponentPaths, joinPaths } from "./var-glyph.js";


export class CachingFont {

  constructor (font, location) {
    this.font = font;
    this.location = location;
    this.cachedGlyphs = {};
  }

  getCachedGlyphInstance(glyphName) {
    return this.cachedGlyphs[glyphName];
  }

  async loadGlyphInstance(glyphName) {
    if (this.font.reversedCmap[glyphName] === undefined) {
      return null;
    }
    let glyphInstance = this.cachedGlyphs[glyphName];
    if (glyphInstance === undefined) {
      const glyph = await this.font.getGlyph(glyphName);
      const location = mapNLILocation(this.location, glyph.axes);
      const instance = await glyph.instantiate(location);
      const componentPaths = await instance.getComponentPaths(
        async glyphName => await this.font.getGlyph(glyphName),
        location,
      )
      glyphInstance = new CachingGlyphInstance(glyphName, instance, componentPaths);
      this.cachedGlyphs[glyphName] = glyphInstance;
    }
    return glyphInstance;
  }

}


class CachingGlyphInstance {

  constructor (glyphName, glyphInstance, componentPaths) {
    this.name = glyphName;
    this.glyphInstance = glyphInstance;
    this.nestedComponentPaths = componentPaths;
    this.xAdvance = glyphInstance.xAdvance;
    this.yAdvance = glyphInstance.yAdvance;
    this.verticalOrigin = glyphInstance.verticalOrigin;
  }

  get flattenedPath() {
    if (this._flattenedPath === undefined) {
      const paths = [this.glyphInstance.path];
      paths.push(...this.nestedComponentPaths.map(flattenComponentPaths));
      this._flattenedPath = joinPaths(paths);
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
    return this.glyphInstance.path;
  }

  get path2d() {
    if (this._path2d === undefined) {
      this._path2d = new Path2D();
      this.glyphInstance.path.drawToPath2d(this._path2d);
    }
    return this._path2d;
  }

  get componentsPath() {
    if (this._componentsPath === undefined) {
      this._componentsPath = joinPaths(this.nestedComponentPaths.map(flattenComponentPaths));
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
