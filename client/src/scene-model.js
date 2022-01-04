import { centeredRect, sectRect } from "./rectangle.js";


export class SceneModel {

  constructor(font, isPointInPath) {
    this.font = font;
    this.isPointInPath = isPointInPath;
    this.userVarLocation = {};
  }

  canSelect() {
    return !!this.instance;
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
    await this._instantiateGlyph(varLocation);
    this.currentSourceIndex = this._findSourceIndexFromLocation(varLocation);
  }

  _findSourceIndexFromLocation(varLocation) {
    for (let i = 0; i < this.glyph.sources.length; i++) {
      const source = this.glyph.sources[i];
      let found = true;
      for (const axis of this.glyph.axes) {
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

  async _instantiateGlyph(varLocation) {
    this.instance = this.glyph.instantiate(varLocation);
    this.hoverSelection = new Set();
    this.path = this.instance.path;
    this.path2d = new Path2D();
    this.path.drawToPath2d(this.path2d);

    let compoPaths2d = [];
    this.componentsBounds = [];
    if (!!this.instance.components) {
      const compoPaths = await this.instance.getComponentPaths(
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
    this.currentSourceIndex = sourceInfo.sourceIndex;
    const source = this.glyph.sources[sourceInfo.sourceIndex];
    this.userVarLocation = {};
    for (const axisInfo of this.getAxisInfo()) {
      this.userVarLocation[axisInfo.name] = axisInfo.defaultValue;
    }
    for (const [name, value] of Object.entries(source.location)) {
      const baseName = _getAxisBaseName(name);
      this.userVarLocation[baseName] = value;
    }
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
