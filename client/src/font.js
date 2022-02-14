import { VariableGlyph } from "./var-glyph.js";


export class Font {

  constructor(fontDataEngine) {
    this.fontDataEngine = fontDataEngine;
  }

  getReverseCmap() {
    return this.fontDataEngine.getReverseCmap();
  }

  getGlobalAxes() {
    return this.fontDataEngine.getGlobalAxes();
  }

  async getGlyph(glyphName) {
    let glyph = await this.fontDataEngine.getGlyph(glyphName);
    if (glyph) {
      glyph = VariableGlyph.fromObject(glyph);
    }
    return glyph;
  }

}
