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

  getSelectedGlyphName() {
    return this.getSelectedGlyph()?.glyph.name;
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

  getLocation() {
    return this.userVarLocation;
  }

  async setLocation(values) {
    this.userVarLocation = values;
    delete this._cachingFont;
  }

  async getCurrentSourceIndex() {
    const glyphName = this.getSelectedGlyphName();
    if (glyphName) {
      const glyph = await this.font.getGlyph(glyphName);
      return findSourceIndexFromLocation(glyph, this.userVarLocation);
    } else {
      return undefined;
    }
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

  async getSourcesInfo() {
    const sourcesInfo = [];
    if (!this.selectedGlyph) {
      return sourcesInfo;
    }
    const positionedGlyph = this.getSelectedGlyph();
    const glyph = await this.font.getGlyph(positionedGlyph.glyph.name);
    for (let i = 0; i < glyph.sources.length; i++) {
      let name = glyph.sources[i].name;
      if (!name) {
        name = `source${i}`;
      }
      sourcesInfo.push({"sourceName": name, "sourceIndex": i})
    }
    return sourcesInfo;
  }

  async setSelectedSource(sourceInfo) {
    if (!this.selectedGlyph) {
      return;
    }
    const positionedGlyph = this.getSelectedGlyph();
    const glyph = this.font.getCachedGlyph(positionedGlyph.glyph.name);

    const source = glyph.sources[sourceInfo.sourceIndex];
    const userVarLocation = {};
    for (const axisInfo of await this.getAxisInfo()) {
      userVarLocation[axisInfo.name] = axisInfo.defaultValue;
    }
    for (const [name, value] of Object.entries(source.location)) {
      const baseName = _getAxisBaseName(name);
      userVarLocation[baseName] = value;
    }
    this.setLocation(userVarLocation);
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
      const baseName = _getAxisBaseName(axis.name);
      let varValue = varLocation[baseName];
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
