import { FontController } from "./font-controller.js"
import { getAxisBaseName } from "./glyph-controller.js"
import { centeredRect, offsetRect, pointInRect, sectRect, unionRect } from "./rectangle.js";
import { pointInConvexPolygon, rectIntersectsPolygon } from "./convex-hull.js";
import { mapForward, mapBackward, normalizeLocation } from "./var-model.js";
import { updateSet } from "./set-ops.js";


export class SceneModel {

  constructor(fontController, isPointInPath) {
    this.fontController = fontController;
    this.isPointInPath = isPointInPath;
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
    return {"lineIndex": Number(lineIndex), "glyphIndex": Number(glyphIndex)};
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
    return this.fontController.location;
  }

  async setLocation(location) {
    this.fontController.location = location;
    await this.updateScene();
  }

  async getSelectedSource() {
    const glyphName = this.getSelectedGlyphName();
    if (glyphName) {
      return await this.fontController.getSourceIndex(glyphName);
    } else {
      return undefined;
    }
  }

  async setSelectedSource(sourceIndex) {
    if (!this.selectedGlyph) {
      return;
    }
    const positionedGlyph = this.getSelectedPositionedGlyph();
    const glyph = await this.fontController.getGlyph(positionedGlyph.glyph.name);

    const source = glyph.sources[sourceIndex];
    const location = {...this.fontController.location};
    for (const [axisName, triple] of Object.entries(glyph.axisDictGlobal)) {
      location[axisName] = triple[1];
    }
    const localToGlobalMapping = glyph.getLocalToGlobalMapping();
    const sourceLocation = mapForward(source.location, localToGlobalMapping);
    for (const [name, value] of Object.entries(sourceLocation)) {
      const baseName = getAxisBaseName(name);
      location[baseName] = value;
    }
    await this.setLocation(mapBackward(location, this.fontController.globalAxes));
  }

  async getAxisInfo() {
    const allAxes = Array.from(this.fontController.globalAxes);
    const globalAxisNames = new Set(allAxes.map(axis => axis.name));
    if (this.selectedGlyph) {
      const positionedGlyph = this.getSelectedPositionedGlyph();
      const glyph = await this.fontController.getGlyph(positionedGlyph.glyph.name);
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
    const glyph = await this.fontController.getGlyph(positionedGlyph.glyph.name);
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
          await this.fontController.getGlyphInstance(glyphName);
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
        this.positionedLines = await buildScene(this.fontController, glyphLines);
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
      this.positionedLines = await buildScene(this.fontController, glyphLines);
      yield;
    }
    const usedGlyphNames = getUsedGlyphNames(this.fontController, this.positionedLines);
    this.fontController.subscribeLiveGlyphChanges(Array.from(usedGlyphNames));
  }

  selectionAtPoint(point, size) {
    if (!this.selectedGlyph) {
      return;
    }
    const positionedGlyph = this.getSelectedPositionedGlyph();
    const selRect = centeredRect(point.x - positionedGlyph.x, point.y - positionedGlyph.y, size);
    for (const hit of positionedGlyph.glyph.path.iterPointsInRect(selRect)) {
      // TODO: we may have to filter or sort for the case when a handle coincides with
      // its anchor, to get a consistent result despite which of the two comes first.
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
  // This returns a list of axes that is a superset of all the axis
  // sets of the input.
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


async function buildScene(fontController, glyphLines) {
  let y = 0;
  const positionedLines = [];
  for (const glyphLine of glyphLines) {
    const positionedLine = {"glyphs": []};
    let x = 0;
    for (const glyphInfo of glyphLine) {
      if (!fontController.isGlyphInstanceLoaded(glyphInfo.glyphName)) {
        continue;
      }
      const glyphInstance = await fontController.getGlyphInstance(glyphInfo.glyphName);
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


function getUsedGlyphNames(fontController, positionedLines) {
  const usedGlyphNames = new Set();
  for (const line of positionedLines) {
    for (const glyph of line.glyphs) {
      usedGlyphNames.add(glyph.glyph.name);
      updateSet(usedGlyphNames, fontController.iterGlyphMadeOf(glyph.glyph.name))
    }
  }
  return usedGlyphNames;
}
