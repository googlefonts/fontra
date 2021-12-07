import VarPath from "./var-path.js";
import { VariationModel, normalizeLocation } from "./var-model.js";
import { Transform } from "./transform.js";


export class VarGlyph {

  static fromObject(obj) {
    const glyph = new VarGlyph();
    glyph.name = obj.name;
    glyph.axes = obj.axes || [];
    glyph.unicodes = obj.unicodes || [];
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

  async getComponentPaths(getGlyphFunc, parentLocation, transform = null) {
    const paths = [];

    for (const compo of this.components) {
      const compoLocation = mergeLocations(parentLocation, compo.coord)
      const glyph = await getGlyphFunc(compo.name);
      const inst = glyph.instantiate(compo.coord || {});
      let t = makeAffineTransform(compo.transform);
      if (transform !== null) {
        t = transform.transform(t);
      }
      const componentPaths = [];
      if (inst.path.numPoints) {
        componentPaths.push(inst.path.transformed(t));
      }
      if (inst.components !== undefined) {
        componentPaths.push(...await inst.getComponentPaths(getGlyphFunc, compoLocation, t));
      }
      if (componentPaths.length > 0) {
        paths.push(componentPaths.reduce((p1, p2) => p1.concat(p2)));
      }
    }
    return paths;
  }

}


function mergeLocations(loc1, loc2) {
  if (!loc1) {
    return loc2;
  }
  const merged = {...loc1};
  for (const k in loc2) {
    merged[k] = loc2[k];
  }
  return merged;
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


function makeAffineTransform(transform) {
  let t = new Transform();
  t = t.translate(transform.x + transform.tcenterx, transform.y + transform.tcentery);
  t = t.rotate(transform.rotation * (Math.PI / 180));
  t = t.scale(transform.scalex, transform.scaley);
  t = t.translate(-transform.tcenterx, -transform.tcentery);
  return t;
}
