import { CachingFont, mapNLILocation } from "./caching-font.js"
import { centeredRect, offsetRect, pointInRect, sectRect, unionRect } from "./rectangle.js";
import { pointInConvexPolygon } from "./convex-hull.js";
import { normalizeLocation } from "./var-model.js";


export class SceneModel {

  constructor(font, isPointInPath) {
    this.font = font;
    this.isPointInPath = isPointInPath;
    this.userVarLocation = {};
    this.glyphLines = [];
    this.positionedLines = [];
    this.selection = new Set();
    this.hoverSelection = new Set();
  }

  get cachingFont() {
    if (this._cachingFont === undefined) {
      this._cachingFont = new CachingFont(this.font, this.userVarLocation);
    }
    return this._cachingFont;
  }

  getSelectedGlyph() {
    if (!this.selectedGlyph) {
      return undefined;
    }
    const [lineIndex, glyphIndex] = this.selectedGlyph.split("/");
    return this.positionedLines[lineIndex]?.glyphs[glyphIndex];
  }

  canSelect() {
    return !!this.selectedGlyph;
  }

  setGlyphLines(glyphLines) {
    this.glyphLines = glyphLines;
    this.selection = new Set();
    this.hoverSelection = new Set();
    delete this.selectedGlyph;
    delete this.hoveredGlyph;
  }

  async updateScene() {
    for await (const _ of this.updateSceneIncrementally(false)) {
      ;
    }
  }

  async *updateSceneIncrementally(incrementally = true) {
    const glyphPromises = {};
    const loadedGlyphs = {};
    const glyphLines = this.glyphLines;
    for (const line of glyphLines) {
      for (const glyph of line) {
        if (glyph.glyphName === undefined || glyphPromises[glyph.glyphName] !== undefined) {
          continue;
        }
        glyphPromises[glyph.glyphName] = (async (glyphName) => {
          await this.cachingFont.loadGlyphInstance(glyphName);
          loadedGlyphs[glyphName] = true;
        })(glyph.glyphName);
      }
    }
    let promises = Object.values(glyphPromises);
    if (incrementally) {
      do {
        if (promises.length) {
          await Promise.race(promises);
          for (const glyphName in loadedGlyphs) {
            delete glyphPromises[glyphName];
          }
        }
        if (glyphLines !== this.glyphLines) {
          return;  // abort, a later call supersedes us
        }
        this.positionedLines = buildScene(this.cachingFont, glyphLines);
        yield;
        promises = Object.values(glyphPromises);
      } while (promises.length);
    } else {
      if (promises.length) {
        await Promise.all(promises);
      }
      if (glyphLines !== this.glyphLines) {
        return;  // abort, a later call supersedes us
      }
      this.positionedLines = buildScene(this.cachingFont, glyphLines);
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
    delete this._cachingFont;

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

  async getAxisInfo() {
    if (this.glyphLines) {
      const axisInfos = {};
      for (const line of this.glyphLines) {
        for (const glyphInfo of line) {
          const glyphName = glyphInfo.glyphName;
          if (!glyphName || axisInfos[glyphName]) {
            continue
          }
          const glyph = await this.font.getGlyph(glyphName);
          if (glyph) {
            axisInfos[glyphName] = getAxisInfoFromGlyph(glyph);
          }
        }
      }
      return mergeAxisInfo(Object.values(axisInfos));
    }
    return [];
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
    for (const axisInfo of await this.getAxisInfo()) {
      this.userVarLocation[axisInfo.name] = axisInfo.defaultValue;
    }
    for (const [name, value] of Object.entries(source.location)) {
      const baseName = _getAxisBaseName(name);
      this.userVarLocation[baseName] = value;
    }
    this.currentSourceIndex = sourceInfo.sourceIndex;
    await this._instantiateGlyph(source.location);
    delete this._cachingFont;  // Should be implied by this.userVarLocation assignment
    await this.updateScene();
  }

  selectionAtPoint(point, size) {
    if (!this.selectedGlyph) {
      return;
    }
    const positionedGlyph = this.getSelectedGlyph();
    const selRect = centeredRect(point.x - positionedGlyph.x, point.y - positionedGlyph.y, size);
    for (const hit of positionedGlyph.glyph.path.iterPointsInRect(selRect)) {
      return new Set([`point/${hit.pointIndex}`])
    }
    const components = positionedGlyph.glyph.components;
    const x = point.x - positionedGlyph.x;
    const y = point.y - positionedGlyph.y;
    for (let i = components.length - 1; i >= 0; i--) {
      const component = components[i];
      if (!pointInRect(x, y, component.controlBounds)) {
        continue;
      }
      if (pointInConvexPolygon(x, y, component.convexHull)) {
        return new Set([`component/${i}`])
      }
    }

    return new Set();
  }

  selectionAtRect(selRect) {
    const selection = new Set();
    if (!this.selectedGlyph) {
      return selection;
    }
    const positionedGlyph = this.getSelectedGlyph();
    selRect = offsetRect(selRect, -positionedGlyph.x, -positionedGlyph.y);
    for (const hit of positionedGlyph.glyph.path.iterPointsInRect(selRect)) {
      selection.add(`point/${hit.pointIndex}`);
    }
    const components = positionedGlyph.glyph.components;
    for (let i = 0; i < components.length; i++) {
      if (!sectRect(selRect, components[i].controlBounds)) {
        continue;
      }
      // TODO: properly test intersection with the convex hull
      selection.add(`component/${i}`);
    }
    return selection;
  }

  glyphAtPoint(point) {
    for (let i = this.positionedLines.length - 1; i >= 0; i--) {
      const positionedLine = this.positionedLines[i];
      if (!positionedLine.bounds || !pointInRect(point.x, point.y, positionedLine.bounds)) {
        continue;
      }
      for (let j = positionedLine.glyphs.length - 1; j >= 0; j--) {
        const positionedGlyph = positionedLine.glyphs[j];
        if (!pointInRect(point.x, point.y, positionedGlyph.bounds)) {
          continue;
        }
        if (pointInConvexPolygon(
          point.x - positionedGlyph.x,
          point.y - positionedGlyph.y,
          positionedGlyph.glyph.convexHull,
        )) {
          return `${i}/${j}`;
        }
      }
    }
    return undefined;
  }

}


function _getAxisBaseName(axisName) {
  return axisName.split("*", 1)[0];
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


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function getAxisInfoFromGlyph(glyph) {
  const axisInfo = {};
  for (const axis of glyph.axes) {
    const baseName = _getAxisBaseName(axis.name);
    if (axisInfo[baseName]) {
      continue;
    }
    axisInfo[baseName] = {...axis, "name": baseName};
  }
  return axisInfo;
}


function mergeAxisInfo(axisInfos) {
  if (!axisInfos.length) {
    return [];
  }
  const mergedAxisInfo = {...axisInfos[0]};
  for (let i = 1; i < axisInfos.length; i++) {
    for (const axisInfo of Object.values(axisInfos[i])) {
      if (mergedAxisInfo[axisInfo.name] !== undefined) {
        mergedAxisInfo[axisInfo.name].minValue = Math.min(mergedAxisInfo[axisInfo.name].minValue, axisInfo.minValue);
        mergedAxisInfo[axisInfo.name].maxValue = Math.max(mergedAxisInfo[axisInfo.name].maxValue, axisInfo.maxValue);
      } else {
        mergedAxisInfo[axisInfo.name] = {...axisInfo};
      }
    }
  }
  return Object.values(mergedAxisInfo);
}


function buildScene(cachingFont, glyphLines) {
  let y = 0;
  const positionedLines = [];
  for (const glyphLine of glyphLines) {
    const positionedLine = {"glyphs": []};
    let x = 0;
    for (const glyphInfo of glyphLine) {
      const glyphInstance = cachingFont.getCachedGlyphInstance(glyphInfo.glyphName);
      if (glyphInstance) {
        const bounds = glyphInstance.controlBounds ? offsetRect(glyphInstance.controlBounds, x, y) : undefined;
        positionedLine.glyphs.push({
          "x": x,
          "y": y,
          "glyph": glyphInstance,
          "bounds": bounds,
        })
        x += glyphInstance.xAdvance;
      }
    }
    y -= 1000;  // TODO
    if (positionedLine.glyphs.length) {
      positionedLine.bounds = unionRect(
        ...positionedLine.glyphs.map(glyph => glyph.bounds).filter(bounds => bounds !== undefined)
      );
      positionedLines.push(positionedLine);
    }
  }
  return positionedLines;
}
