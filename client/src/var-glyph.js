import VarPath from "../src/var-path.js";


export class VarGlyph {

  static fromObject(obj) {
    const glyph = new VarGlyph();
    glyph.name = obj.name;
    glyph.axes = obj.axes;
    glyph.unicodes = obj.unicodes;
    glyph.sources = obj.sources.map(item => {
      return {"location": item.location, "source": VarSource.fromObject(item.source)}
    });
    return glyph;
  }

}


class VarSource {

  static fromObject(obj) {
    const source = new VarSource();
    source.hAdvance = obj.hAdvance;
    source.vAdvance = obj.vAdvance;
    source.verticalOrigin = obj.verticalOrigin;
    source.path = VarPath.fromObject(obj.path);
    source.components = obj.components;
    return source
  }

}
