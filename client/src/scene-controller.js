import {
  SceneGraph,
  ComponentsLayer,
  HandlesLayer,
  PathLayer,
  NodesLayer,
  SelectionLayer,
  RectangleSelectionLayer,
} from "./scene-graph.js";
import { centeredRect, sectRect } from "./rectangle.js";



export class SceneController {
  constructor(canvasController, font) {
    this.canvasController = canvasController;
    this.font = font;
    this.instance = null;

    this.componentsLayer = new ComponentsLayer();
    this.handlesLayer = new HandlesLayer();
    this.pathLayer = new PathLayer();
    this.nodesLayer = new NodesLayer();
    this.selectionLayer = new SelectionLayer("selection")
    this.hoverLayer = new SelectionLayer("hover")
    this.rectSelectLayer = new RectangleSelectionLayer("hover")

    this.scene = new SceneGraph();
    this.scene.push(this.componentsLayer);
    this.scene.push(this.handlesLayer);
    this.scene.push(this.nodesLayer);
    this.scene.push(this.pathLayer);
    this.scene.push(this.selectionLayer);
    this.scene.push(this.hoverLayer);
    this.scene.push(this.rectSelectLayer);

    this.canvasController.scene = this.scene;
  }

  *_iterPathLayers() {
    yield this.handlesLayer;
    yield this.pathLayer;
    yield this.nodesLayer;
    yield this.selectionLayer;
    yield this.hoverLayer;
  }

  resetSelection() {
    this.selectionLayer.selection = new Set();
    this.hoverLayer.selection = new Set();
  }

  async setSelectedGlyph(glyphName) {
    const glyph = await this.font.getGlyph(glyphName);
    if (glyph === null) {
      return false;
    }
    this.glyph = glyph;
    this.varLocation = {};
    this.axisMapping = _makeAxisMapping(this.glyph.axes);
    await this._instantiateGlyph();
    this.canvasController.setNeedsUpdate();
    this.resetSelection();
    return true;
  }

  async _instantiateGlyph() {
    const instance = this.glyph.instantiate(this.varLocation);
    await this.setInstance(instance);
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

  async setAxisValue(axisName, value) {
    for (const realAxisName of this.axisMapping[axisName]) {
      this.varLocation[realAxisName] = value;
    }
    await this._instantiateGlyph();
    this.canvasController.setNeedsUpdate();
  }

  async setInstance(instance) {
    this.instance = instance;
    this.hoverLayer.selection = new Set();
    await this.updateScene();
  }

  canSelect() {
    return !!this.instance;
  }

  async updateScene() {
    for (const layer of this._iterPathLayers()) {
      layer.path = this.instance.path;
    }

    let compoPaths2d = [];
    this.componentsBounds = [];
    if (!!this.instance.components) {
      const compoPaths = await this.instance.getComponentPaths(
        async glyphName => await this.font.getGlyph(glyphName),
        this.varLocation,
      );
      compoPaths2d = compoPaths.map(path => {
        const path2d = new Path2D();
        path.drawToPath(path2d);
        return path2d;
      });
      this.componentsBounds = compoPaths.map(path => path.getControlBounds());
    }
    this.componentsLayer.paths = compoPaths2d;
    this.selectionLayer.componentPaths = compoPaths2d;
    this.hoverLayer.componentPaths = compoPaths2d;
  }

  selectionAtPoint(point, size, context) {
    if (this.instance === null) {
      return new Set();
    }
    const selRect = centeredRect(point.x, point.y, size);

    for (const hit of this.instance.path.iterPointsInRect(selRect)) {
      return new Set([`point/${hit.pointIndex}`])
    }
    for (let i = this.componentsLayer.paths.length - 1; i >= 0; i--) {
      const path = this.componentsLayer.paths[i];
      if (context.isPointInPath(path, point.x, point.y)) {
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
