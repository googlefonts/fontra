import { CachingFont, getAxisBaseName } from "./caching-font.js"
import { centeredRect, offsetRect, pointInRect, sectRect, unionRect } from "./rectangle.js";
import { pointInConvexPolygon, rectIntersectsPolygon } from "./convex-hull.js";
import { mapForward, mapBackward, normalizeLocation } from "./var-model.js";


export class SceneModel {

  constructor(font, isPointInPath) {
    this.font = font;
    this.isPointInPath = isPointInPath;
    this.cachingFont = new CachingFont(this.font, {});
    this.glyphLines = [];
    this.positionedLines = [];
    this.selection = new Set();
    this.hoverSelection = new Set();
    this.selectedGlyph = undefined;
    this.hoveredGlyph = undefined;
  }

  getSelectedPositionedGlyph() {
    if (!this.selectedGlyph) {
      return undefined;
    }
    const [lineIndex, glyphIndex] = this.selectedGlyph.split("/");
    return this.positionedLines[lineIndex]?.glyphs[glyphIndex];
  }

  getSelectedGlyphName() {
    return this.getSelectedPositionedGlyph()?.glyph.name;
  }

  getSelectedGlyphIndex() {
    if (!this.selectedGlyph) {
      return undefined;
    }
    const [lineIndex, glyphIndex] = this.selectedGlyph.split("/");
    return {"lineIndex": lineIndex, "glyphIndex": glyphIndex};
  }

  canSelect() {
    return !!this.selectedGlyph;
  }

  getGlyphLines() {
    return this.glyphLines;
  }

  setGlyphLines(glyphLines, updateIncrementally = false) {
    this.glyphLines = glyphLines;
    this.selection = new Set();
    this.hoverSelection = new Set();
    this.selectedGlyph = undefined;
    this.hoveredGlyph = undefined;
    if (updateIncrementally) {
      return this.updateSceneIncrementally();
    } else {
      return this.updateScene();
    }
  }

  getLocation() {
    return this.cachingFont.location;
  }

  async setLocation(location) {
    this.cachingFont.location = location;
    await this.updateScene();
  }

  async getSelectedSource() {
    const glyphName = this.getSelectedGlyphName();
    if (glyphName) {
      return await this.cachingFont.getSourceIndex(glyphName);
    } else {
      return undefined;
    }
  }

  async setSelectedSource(sourceIndex) {
    if (!this.selectedGlyph) {
      return;
    }
    const positionedGlyph = this.getSelectedPositionedGlyph();
    const glyph = await this.font.getGlyph(positionedGlyph.glyph.name);

    const source = glyph.sources[sourceIndex];
    const location = {...this.cachingFont.location};
    for (const [axisName, triple] of Object.entries(glyph.axisDictGlobal)) {
      location[axisName] = triple[1];
    }
    const localToGlobalMapping = glyph.getLocalToGlobalMapping();
    const sourceLocation = mapForward(source.location, localToGlobalMapping);
    for (const [name, value] of Object.entries(sourceLocation)) {
      const baseName = getAxisBaseName(name);
      location[baseName] = value;
    }
    await this.setLocation(mapBackward(location, await this.font.globalAxes));
  }

  async getAxisInfo() {
    const allAxes = Array.from(await this.font.globalAxes);
    const globalAxisNames = new Set(allAxes.map(axis => axis.name));
    if (this.selectedGlyph) {
      const positionedGlyph = this.getSelectedPositionedGlyph();
      const glyph = await this.font.getGlyph(positionedGlyph.glyph.name);
      const glyphAxes = getAxisInfoFromGlyph(glyph).filter(axis => !globalAxisNames.has(axis.name));
      allAxes.push(...glyphAxes);
    }
    return allAxes;
  }

  async getSourcesInfo() {
    const sourcesInfo = [];
    if (!this.selectedGlyph) {
      return sourcesInfo;
    }
    const positionedGlyph = this.getSelectedPositionedGlyph();
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

  async updateScene() {
    for await (const _ of this.updateSceneIncrementally(false)) {
      ;
    }
  }

  async *updateSceneIncrementally(incrementally = true) {
    const glyphPromises = {};
    let loadedGlyphs = {};
    const glyphLines = this.glyphLines;
    for (const line of glyphLines) {
      for (const glyph of line) {
        if (glyph.glyphName === undefined || glyph.glyphName in glyphPromises) {
          continue;
        }
        glyphPromises[glyph.glyphName] = (async (glyphName) => {
          await this.cachingFont.getGlyphInstance(glyphName);
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
          loadedGlyphs = {};
        }
        if (glyphLines !== this.glyphLines) {
          return;  // abort, a later call supersedes us
        }
        this.positionedLines = await buildScene(this.cachingFont, glyphLines);
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
      this.positionedLines = await buildScene(this.cachingFont, glyphLines);
      yield;
    }
  }

  selectionAtPoint(point, size) {
    if (!this.selectedGlyph) {
      return;
    }
    const positionedGlyph = this.getSelectedPositionedGlyph();
    const selRect = centeredRect(point.x - positionedGlyph.x, point.y - positionedGlyph.y, size);
    for (const hit of positionedGlyph.glyph.path.iterPointsInRect(selRect)) {
      return new Set([`point/${hit.pointIndex}`])
    }
    const components = positionedGlyph.glyph.components;
    const x = point.x - positionedGlyph.x;
    const y = point.y - positionedGlyph.y;
    const componentHullMatches = [];
    for (let i = components.length - 1; i >= 0; i--) {
      const component = components[i];
      if (pointInRect(x, y, component.controlBounds)
          && pointInConvexPolygon(x, y, component.convexHull)) {
        componentHullMatches.push({"index": i, "component": component});
      }
    }
    switch (componentHullMatches.length) {
      case 0:
        return new Set();
      case 1:
        return new Set([`component/${componentHullMatches[0].index}`]);
    }
    // If we have multiple matches, take the first that has an actual
    // point inside the path, and not just inside the hull
    for (const match of componentHullMatches) {
      if (this.isPointInPath(match.component.path2d, x, y)) {
        return new Set([`component/${match.index}`]);
      }
    }
    // Else, fall back to the first match
    return new Set([`component/${componentHullMatches[0].index}`]);
  }

  selectionAtRect(selRect) {
    const selection = new Set();
    if (!this.selectedGlyph) {
      return selection;
    }
    const positionedGlyph = this.getSelectedPositionedGlyph();
    selRect = offsetRect(selRect, -positionedGlyph.x, -positionedGlyph.y);
    for (const hit of positionedGlyph.glyph.path.iterPointsInRect(selRect)) {
      selection.add(`point/${hit.pointIndex}`);
    }
    const components = positionedGlyph.glyph.components;
    for (let i = 0; i < components.length; i++) {
      if (sectRect(selRect, components[i].controlBounds)
          && rectIntersectsPolygon(selRect, components[i].convexHull)) {
        selection.add(`component/${i}`);
      }
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
        if (!positionedGlyph.bounds || !pointInRect(point.x, point.y, positionedGlyph.bounds)) {
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


function getAxisInfoFromGlyph(glyph) {
  const axisInfo = {};
  for (const axis of glyph.axes) {
    const baseName = getAxisBaseName(axis.name);
    if (axisInfo[baseName]) {
      continue;
    }
    axisInfo[baseName] = {...axis, "name": baseName};
  }
  return Object.values(axisInfo);
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


async function buildScene(cachingFont, glyphLines) {
  let y = 0;
  const positionedLines = [];
  for (const glyphLine of glyphLines) {
    const positionedLine = {"glyphs": []};
    let x = 0;
    for (const glyphInfo of glyphLine) {
      if (!cachingFont.isGlyphInstanceLoaded(glyphInfo.glyphName)) {
        continue;
      }
      const glyphInstance = await cachingFont.getGlyphInstance(glyphInfo.glyphName);
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
    y -= 1100;  // TODO
    if (positionedLine.glyphs.length) {
      positionedLine.bounds = unionRect(
        ...positionedLine.glyphs.map(glyph => glyph.bounds).filter(bounds => bounds !== undefined)
      );
      positionedLines.push(positionedLine);
    }
  }
  return positionedLines;
}
