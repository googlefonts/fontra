import { LRUCache } from "./lru-cache.js";
import { VarGlyph } from "./var-glyph.js";


export class Font {

  constructor(fontDataEngine) {
    this.fontDataEngine = fontDataEngine;
    this._glyphsPromiseCache = new LRUCache(250);
  }

  async setupCmap() {
    this.reversedCmap = await this.fontDataEngine.getReversedCmap();
    this.cmap = makeCmapFromReversedCmap(this.reversedCmap);
    this._cmapDoneLoading?.call();
  }

  async cmapReady() {
    if (this.reversedCmap) {
      return;
    }
    await new Promise((resolve, reject) => {
      this._cmapDoneLoading = resolve;
    });
  }

  codePointForGlyph(glyphName) {
    for (const codePoint of this.reversedCmap[glyphName] || []) {
      if (this.cmap[codePoint] === glyphName) {
        return codePoint;
      }
    }
    return undefined;
  }

  getGlyph(glyphName) {
    if (this.reversedCmap[glyphName] === undefined) {
      return null;
    }
    let glyphPromise = this._glyphsPromiseCache.get(glyphName);
    if (glyphPromise === undefined) {
      glyphPromise = (async () => {
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
