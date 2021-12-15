import { LRUCache } from "./lru-cache.js";
import { VarGlyph } from "./var-glyph.js";


export class Font {

  constructor(fontDataEngine) {
    this.fontDataEngine = fontDataEngine;
    this._glyphsCache = new LRUCache(250);
  }

  async getReversedCmap() {
    return await this.fontDataEngine.getReversedCmap();
  }

  async getGlyph(glyphName) {
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
