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

    const scene = new SceneGraph();
    scene.push(this.componentsLayer);
    scene.push(this.handlesLayer);
    scene.push(this.nodesLayer);
    scene.push(this.pathLayer);
    scene.push(this.selectionLayer);
    scene.push(this.hoverLayer);
    scene.push(this.rectSelectLayer);

    this.canvasController.scene = scene;
  }

  localPoint(point) {
    return this.canvasController.localPoint(point);
  }

  get onePixelUnit() {
    return this.canvasController.onePixelUnit;
  }

  get mouseClickMargin() {
    return this.canvasController.drawingParameters.nodeSize;
  }

  get selection() {
    return this.selectionLayer.selection;
  }

  set selection(selection) {
    this.selectionLayer.selection = selection;
    this.canvasController.setNeedsUpdate();
  }

  get hoverSelection() {
    return this.hoverLayer.selection;
  }

  set hoverSelection(selection) {
    this.hoverLayer.selection = selection;
    this.canvasController.setNeedsUpdate();
  }

  get selectionRect() {
    return this.rectSelectLayer.selectionRect;
  }

  set selectionRect(selRect) {
    this.rectSelectLayer.selectionRect = selRect;
    this.canvasController.setNeedsUpdate();
  }

  setDrawingParameters(drawingParameters) {
    this.canvasController.setDrawingParameters(drawingParameters);
  }

  *_iterPathLayers() {
    yield this.handlesLayer;
    yield this.pathLayer;
    yield this.nodesLayer;
    yield this.selectionLayer;
    yield this.hoverLayer;
  }

  resetSelection() {
    this.selection = new Set();
    this.hoverSelection = new Set();
  }

  async setSelectedGlyph(glyphName) {
    this._selectedGlyphName = glyphName
    const glyph = await this.font.getGlyph(glyphName);
    if (glyph === null || this._selectedGlyphName != glyphName) {
      return false;
    }
    this.glyph = glyph;
    this.varLocation = {};
    this.axisMapping = _makeAxisMapping(this.glyph.axes);
    await this.instantiateGlyph();
    this.resetSelection();
    return true;
  }

  async instantiateGlyph() {
    await this.setInstance(this.glyph.instantiate(this.varLocation));
  }

  async setInstance(instance) {
    this.instance = instance;
    this.hoverSelection = new Set();
    await this.updateScene();
    this.canvasController.setNeedsUpdate();
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
    await this.instantiateGlyph();
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

  selectionAtPoint(point, size) {
    if (this.instance === null) {
      return new Set();
    }
    const selRect = centeredRect(point.x, point.y, size);

    for (const hit of this.instance.path.iterPointsInRect(selRect)) {
      return new Set([`point/${hit.pointIndex}`])
    }
    const context = this.canvasController.context;
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
