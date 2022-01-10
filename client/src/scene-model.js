import { centeredRect, sectRect } from "./rectangle.js";
import { normalizeLocation } from "./var-model.js";


export class SceneModel {

  constructor(font, isPointInPath) {
    this.font = font;
    this.isPointInPath = isPointInPath;
    this.userVarLocation = {};
  }

  canSelect() {
    return !!this.instance;
  }

  setGlyphLines(glyphLines) {
    this.glyphLines = glyphLines;
  }

  async *updateScene() {
    const glyphPromises = {};
    const glyphs = {};
    for (const line of this.glyphLines) {
      for (const glyph of line) {
        if (glyph.glyphName === undefined) {
          continue;
        }
        glyphPromises[glyph.glyphName] = (async (glyphName) => {
          console.log("loading", glyphName);
          glyphs[glyphName] = await this.font.getGlyph(glyphName);
          // XXXX Need caching font wrapper at location?
          // glyphInstances[glyphName] = ...
          // glyphPaths[glyphName] = ...
          delete glyphPromises[glyphName];
        })(glyph.glyphName);
      }
    }
    while (Object.keys(glyphPromises).length) {
      await Promise.race(Object.values(glyphPromises));
      console.log(glyphs);
      yield;
    }
  }

  async setSelectedGlyph(glyphName) {
    this._selectedGlyphName = glyphName
    const glyph = await this.font.getGlyph(glyphName);
    if (glyph === null || this._selectedGlyphName != glyphName) {
      return false;
    }
    this.glyph = glyph;
    this.axisMapping = _makeAxisMapping(this.glyph.axes);
    await this.setAxisValues(this.userVarLocation);
    this.selection = new Set();
    this.hoverSelection = new Set();
    return true;
  }

  getAxisValues() {
    return this.userVarLocation;
  }

  async setAxisValues(values) {
    this.userVarLocation = values;
    const varLocation = {};
    for (const [name, value] of Object.entries(values)) {
      this.axisMapping[name]?.forEach(realAxisName => {
        varLocation[realAxisName] = value
      });
    }
    this.currentSourceIndex = findSourceIndexFromLocation(this.glyph, varLocation);
    await this._instantiateGlyph(varLocation);
  }

  async _instantiateGlyph(varLocation) {
    try {
      this.instance = this.glyph.instantiate(varLocation);
    } catch(error) {
      if (error.name !== "VariationError") {
        throw error;
      }
      const nearestSource = findClosestSourceIndexFromLocation(this.glyph, varLocation);
      console.log(`Interpolation error while instantiating ${this.glyph.name}`);
      this.instance = this.glyph.sources[nearestSource.index].source;
    }
    this.hoverSelection = new Set();
    this.path = this.instance.path;
    this.path2d = new Path2D();
    this.path.drawToPath2d(this.path2d);

    let compoPaths2d = [];
    this.componentsBounds = [];
    if (!!this.instance.components) {
      const compoPaths = await this.instance.getComponentPathsFlattened(
        async glyphName => await this.font.getGlyph(glyphName),
        varLocation,
      );
      compoPaths2d = compoPaths.map(path => {
        const path2d = new Path2D();
        path.drawToPath2d(path2d);
        return path2d;
      });
      this.componentsBounds = compoPaths.map(path => path.getControlBounds());
    }
    this.componentPaths = compoPaths2d;
  }

  *getAxisInfo() {
    if (!this.glyph.axes) {
      return;
    }
    const done = {};
    for (const axis of this.glyph.axes) {
      const baseName = _getAxisBaseName(axis.name);
      if (done[baseName]) {
        continue;
      }
      done[baseName] = true;
      const axisInfo = {...axis};
      axisInfo.name = baseName;
      yield axisInfo;
    }
  }

  getSourcesInfo() {
    const sourcesInfo = [];
    if (!this.glyph) {
      return sourcesInfo;
    }
    for (let i = 0; i < this.glyph.sources.length; i++) {
      let name = this.glyph.sources[i].name;
      if (!name) {
        name = `source${i}`;
      }
      sourcesInfo.push({"sourceName": name, "sourceIndex": i})
    }
    return sourcesInfo;
  }

  async setSelectedSource(sourceInfo) {
    if (!this.glyph) {
      return;
    }
    const source = this.glyph.sources[sourceInfo.sourceIndex];
    this.userVarLocation = {};
    for (const axisInfo of this.getAxisInfo()) {
      this.userVarLocation[axisInfo.name] = axisInfo.defaultValue;
    }
    for (const [name, value] of Object.entries(source.location)) {
      const baseName = _getAxisBaseName(name);
      this.userVarLocation[baseName] = value;
    }
    this.currentSourceIndex = sourceInfo.sourceIndex;
    await this._instantiateGlyph(source.location);
  }

  selectionAtPoint(point, size) {
    if (this.instance === undefined) {
      return new Set();
    }
    const selRect = centeredRect(point.x, point.y, size);

    for (const hit of this.instance.path.iterPointsInRect(selRect)) {
      return new Set([`point/${hit.pointIndex}`])
    }
    for (let i = this.componentPaths.length - 1; i >= 0; i--) {
      const path = this.componentPaths[i];
      if (this.isPointInPath(path, point.x, point.y)) {
        return new Set([`component/${i}`])
      }
    }
    return new Set();
  }

  selectionAtRect(selRect) {
    const selection = new Set();
    for (const hit of this.instance.path.iterPointsInRect(selRect)) {
      selection.add(`point/${hit.pointIndex}`);
    }
    for (let i = 0; i < this.componentsBounds.length; i++) {
      if (sectRect(selRect, this.componentsBounds[i]) !== null) {
        selection.add(`component/${i}`);
      }
    }
    return selection;
  }

}


function _makeAxisMapping(axes) {
  const axisMapping = {};
  for (const axis of axes) {
    const baseName = _getAxisBaseName(axis.name);
    if (axisMapping[baseName] === undefined) {
      axisMapping[baseName] = [];
    }
    axisMapping[baseName].push(axis.name);
  }
  return axisMapping;
}


function _getAxisBaseName(axisName) {
  const asterixPos = axisName.indexOf("*");
  if (asterixPos > 0) {
    return axisName.slice(0, asterixPos);
  }
  return axisName;
}


function findSourceIndexFromLocation(glyph, varLocation) {
  for (let i = 0; i < glyph.sources.length; i++) {
    const source = glyph.sources[i];
    let found = true;
    for (const axis of glyph.axes) {
      let varValue = varLocation[axis.name];
      let sourceValue = source.location[axis.name];
      if (varValue === undefined) {
        varValue = axis.defaultValue;
      }
      if (sourceValue === undefined) {
        sourceValue = axis.defaultValue;
      }
      if (varValue !== sourceValue) {
        found = false;
        break;
      }
    }
    if (found) {
      return i;
    }
  }
  return undefined;
}


function findClosestSourceIndexFromLocation(glyph, varLocation) {
  const axisDict = {};
  for (const axis of glyph.axes) {
    axisDict[axis.name] = [axis.minValue, axis.defaultValue, axis.maxValue];
  }
  const location = normalizeLocation(varLocation, axisDict);
  const distances = [];
  for (let i = 0; i < glyph.sources.length; i++) {
    const sourceLocation = normalizeLocation(glyph.sources[i].location, axisDict);
    let distanceSquared = 0;
    for (const [axisName, value] of Object.entries(location)) {
      const sourceValue = sourceLocation[axisName];
      distanceSquared += (sourceValue - value) ** 2;
    }
    distances.push([distanceSquared, i]);
    if (distanceSquared === 0) {
      // exact match, no need to look further
      break;
    }
  }
  distances.sort((a, b) => {
    const da = a[0];
    const db = b[0];
    return (a > b) - (a < b);
  });
  return {distance: Math.sqrt(distances[0][0]), index: distances[0][1]}
}
