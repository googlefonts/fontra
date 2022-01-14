import { flattenComponentPaths, joinPaths } from "./var-glyph.js";


export class CachingFont {

  constructor (font, location) {
    this.font = font;
    this.location = location;
    this.cachedGlyphs = {};
  }

  async getGlyphInstance(glyphName) {
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
    this.componentPaths = componentPaths;
    this.xAdvance = glyphInstance.xAdvance;
    this.yAdvance = glyphInstance.yAdvance;
    this.verticalOrigin = glyphInstance.verticalOrigin;
  }

  get path() {
    if (this._path === undefined) {
      const paths = [this.glyphInstance.path];
      paths.push(...this.componentPaths.map(flattenComponentPaths));
      this._path = joinPaths(paths);
    }
    return this._path;
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
