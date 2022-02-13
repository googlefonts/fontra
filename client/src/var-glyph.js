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

  get sourceGlyph() {
    // TODO cache?
    for (const layer of this.layers) {
      if (layer.name === this.sourceLayerName) {
        return layer.glyph;
      }
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
    source.components = obj.components?.map(compo => Component.fromObject(compo)) || [];
    return source
  }

}


class Component {

  static fromObject(obj) {
    const compo = new Component();
    compo.name = obj.name;
    compo.transformation = obj.transformation;
    compo.location = obj.location;
    return compo;
  }

}
