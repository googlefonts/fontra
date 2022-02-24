import VarPath from "./var-path.js";


export class VariableGlyph {

  static fromObject(obj) {
    const glyph = new VariableGlyph();
    glyph.name = obj.name;
    glyph.axes = obj.axes || [];
    glyph.unicodes = obj.unicodes || [];
    glyph.sources = obj.sources.map(source => Source.fromObject(source));
    return glyph;
  }

}


class Source {

  static fromObject(obj) {
    const source = new Source();
    source.name = obj.name;
    source.location = obj.location;
    source.sourceLayerName = obj.sourceLayerName;
    source.layers = obj.layers.map(layer => {
      return {
        "name": layer.name,
        "glyph": StaticGlyph.fromObject(layer.glyph),
      }
    });
    return source;
  }

  get sourceLayerIndex() {
    for (let i = 0; i < this.layers.length; i++) {
      if (this.layers[i].name === this.sourceLayerName) {
        return i;
      }
    }
  }

  get sourceGlyph() {
    const i = this.sourceLayerIndex;
    if (i !== undefined) {
      return this.layers[i].glyph;
    }
  }

}


class StaticGlyph {

  static fromObject(obj) {
    const source = new StaticGlyph();
    source.xAdvance = obj.xAdvance;
    source.yAdvance = obj.yAdvance;
    source.verticalOrigin = obj.verticalOrigin;
    if (obj.path) {
      source.path = VarPath.fromObject(obj.path);
    } else {
      source.path = new VarPath();
    }
    source.components = obj.components || [];
    return source
  }

}
