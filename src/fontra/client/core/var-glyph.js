import { VarPackedPath } from "./var-path.js";

export class VariableGlyph {
  static fromObject(obj) {
    const glyph = new VariableGlyph();
    glyph.name = obj.name;
    glyph.axes =
      obj.axes?.map((axis) => {
        return { ...axis };
      }) || [];
    glyph.sources = obj.sources.map((source) => Source.fromObject(source));
    glyph.layers = Object.fromEntries(
      Object.entries(obj.layers).map(([name, layer]) => [name, Layer.fromObject(layer)])
    );
    return glyph;
  }

  copy() {
    return VariableGlyph.fromObject(this);
  }

  getLayer(layerName) {
    return this.layers[layerName];
  }
}

export class Layer {
  static fromObject(obj) {
    const layer = new Layer();
    layer.glyph = StaticGlyph.fromObject(obj.glyph);
    return layer;
  }
}

class Source {
  static fromObject(obj) {
    const source = new Source();
    source.name = obj.name;
    source.location = { ...obj.location } || {};
    source.layerName = obj.layerName;
    return source;
  }
}

export class StaticGlyph {
  static fromObject(obj) {
    const source = new StaticGlyph();
    source.xAdvance = obj.xAdvance;
    source.yAdvance = obj.yAdvance;
    source.verticalOrigin = obj.verticalOrigin;
    if (obj.path) {
      source.path = VarPackedPath.fromObject(obj.path);
    } else {
      source.path = new VarPackedPath();
    }
    source.components = obj.components?.map(copyComponent) || [];
    return source;
  }

  copy() {
    return StaticGlyph.fromObject(this);
  }
}

function copyComponent(component) {
  return {
    name: component.name,
    transformation: { ...component.transformation },
    location: { ...component.location },
  };
}
