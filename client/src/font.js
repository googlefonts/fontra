import { LRUCache } from "./lru-cache.js";
import { VarGlyph } from "./var-glyph.js";


export class Font {

  constructor(fontDataEngine) {
    this.fontDataEngine = fontDataEngine;
    this._glyphsCache = new LRUCache(250);
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

  async getGlyph(glyphName) {
    if (this.reversedCmap[glyphName] === undefined) {
      return null;
    }
    let glyph = this._glyphsCache.get(glyphName);
    if (glyph === undefined) {
      glyph = await this.fontDataEngine.getGlyph(glyphName);
      if (glyph !== null) {
        glyph = VarGlyph.fromObject(glyph);
      }
      this._glyphsCache.put(glyphName, glyph);
      // console.log("LRU size", this._glyphsCache.map.size);
    }
    return glyph;
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
