import VarPath from "./var-path.js";
import { Transform } from "./transform.js";


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

  async getComponentPaths(getGlyphFunc, parentLocation, transformation = null) {
    const paths = [];

    for (const compo of this.components || []) {
      paths.push(await compo.getNestedPaths(getGlyphFunc, parentLocation, transformation));
    }
    return paths;
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

  async getPath(getGlyphFunc, parentLocation, transformation = null) {
    return flattenComponentPaths(await this.getNestedPaths(getGlyphFunc, parentLocation, transformation));
  }

  async getNestedPaths(getGlyphFunc, parentLocation, transformation = null) {
    const compoLocation = mergeLocations(parentLocation, this.location);
    const glyph = await getGlyphFunc(this.name);
    let inst;
    try {
      inst = glyph.instantiate(compoLocation || {}, false);
    } catch (error) {
      if (error.name !== "VariationError") {
        throw error;
      }
      const errorMessage = `Interpolation error while instantiating component ${this.name}`;
      console.log(errorMessage);
      return {"error": errorMessage};
    }
    let t = makeAffineTransform(this.transformation);
    if (transformation) {
      t = transformation.transform(t);
    }
    const componentPaths = {};
    if (inst.path.numPoints) {
      componentPaths["path"] = inst.path.transformed(t);
    }
    componentPaths["children"] = await inst.getComponentPaths(getGlyphFunc, compoLocation, t);
    return componentPaths;
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


function makeAffineTransform(transformation) {
  let t = new Transform();
  t = t.translate(transformation.x + transformation.tcenterx, transformation.y + transformation.tcentery);
  t = t.rotate(transformation.rotation * (Math.PI / 180));
  t = t.scale(transformation.scalex, transformation.scaley);
  t = t.translate(-transformation.tcenterx, -transformation.tcentery);
  return t;
}


export function flattenComponentPaths(item) {
  const paths = [];
  if (item.path !== undefined) {
    paths.push(item.path);
  }
  if (item.children !== undefined) {
    for (const child of item.children) {
      const childPath = flattenComponentPaths(child);
      if (!!childPath) {
        paths.push(childPath);
      }
    }
  }
  return joinPaths(paths);
}


export function joinPaths(paths) {
  if (paths.length) {
    return paths.reduce((p1, p2) => p1.concat(p2));
  }
  return new VarPath();
}
