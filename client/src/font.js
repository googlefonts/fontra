import { LRUCache } from "./lru-cache.js";
import { VarGlyph } from "./var-glyph.js";


export class Font {

  constructor(fontDataEngine) {
    this.fontDataEngine = fontDataEngine;
    this._glyphsPromiseCache = new LRUCache(250);
    this._reversedCmapPromise = undefined;
    this._cmapPromise = undefined;
    this._userAxesPromise = undefined;
  }

  get reversedCmap() {
    if (this._reversedCmapPromise === undefined) {
      this._reversedCmapPromise = this.fontDataEngine.getReversedCmap()
    }
    return this._reversedCmapPromise;
  }

  get cmap() {
    if (this._cmapPromise === undefined) {
      this._cmapPromise = (async () => {
        return makeCmapFromReversedCmap(await this.reversedCmap);
      })();
    }
    return this._cmapPromise;
  }

  get userAxes() {
    if (this._userAxesPromise === undefined) {
      this._userAxesPromise = this.fontDataEngine.getUserAxes()
    }
    return this._userAxesPromise;
  }

  async codePointForGlyph(glyphName) {
    const reversedCmap = await this.reversedCmap;
    const cmap = await this.cmap;
    for (const codePoint of reversedCmap[glyphName] || []) {
      if (cmap[codePoint] === glyphName) {
        return codePoint;
      }
    }
    return undefined;
  }

  async hasGlyph(glyphName) {
    return glyphName in await this.reversedCmap;
  }

  getGlyph(glyphName) {
    let glyphPromise = this._glyphsPromiseCache.get(glyphName);
    if (glyphPromise === undefined) {
      glyphPromise = (async () => {
        if (!await this.hasGlyph(glyphName)) {
          return null;
        }
        let glyph = await this.fontDataEngine.getGlyph(glyphName);
        if (glyph !== null) {
          glyph = VarGlyph.fromObject(glyph);
        }
        return glyph;
      })();
      this._glyphsPromiseCache.put(glyphName, glyphPromise);
      // console.log("LRU size", this._glyphsPromiseCache.map.size);
    }
    return glyphPromise;
  }

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
