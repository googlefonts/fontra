import VarPath from "../src/var-path.js";
import { VariationModel, normalizeLocation } from "../src/var-model.js";


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
      const axisDict = this.axisDict;
      const locations = this.sources.map(source => source.location);
      this._model = new VariationModel(
        locations.map(location => normalizeLocationSparse(location, axisDict)),
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

  get axisDict() {
    if (this._axisDict === undefined) {
      this._axisDict = {};
      for (const axis of this.axes) {
        this._axisDict[axis.name] = [axis.minValue, axis.defaultValue, axis.maxValue];
      }
    }
    return this._axisDict;
  }

  instantiate(location) {
    return this.model.interpolateFromDeltas(
      normalizeLocation(location, this.axisDict), this.deltas
    );
  }

}


class VarSource {

  static fromObject(obj) {
    const source = new VarSource();
    source.hAdvance = obj.hAdvance;
    source.vAdvance = obj.vAdvance;
    source.verticalOrigin = obj.verticalOrigin;
    if (obj.path !== undefined) {
      source.path = VarPath.fromObject(obj.path);
    } else {
      source.path = new VarPath();
    }
    source.components = obj.components;
    return source
  }

}



function normalizeLocationSparse(location, axes) {
  const normLoc = normalizeLocation(location, axes);
  for (const [name, value] of Object.entries(normLoc)) {
    if (!value) {
      delete normLoc[name];
    }
  }
  return normLoc;
}
