import VarPath from "../src/var-path.js";
import { VariationModel } from "../src/var-model.js";


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

  get model() {
    if (this._model === undefined) {
      this._model = new VariationModel(
        this.sources.map(source => source.location),
        this.axes.map(axis => axis.name));
    }
    return this._model;
  }

  get deltas() {
    if (this._deltas === undefined) {
      const masterValues = this.sources.map(source => source.source);
      this._deltas = this.model.getDeltas(masterValues);
    }
    return this._deltas;
  }

  instantiate(location) {
    return this.model.interpolateFromDeltas(location, this.deltas);
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
