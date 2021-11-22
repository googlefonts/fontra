import { getRemoteProxy } from "./remote.js";
import VarPath from "./var-path.js";
import { VarGlyph } from "./var-glyph.js";
import { CanvasController } from "./canvas-controller.js";
import {
  SceneGraph,
  ComponentPathItem,
  PathHandlesItem,
  PathPathItem,
  PathNodesItem,
  SelectionLayer,
} from "./scene-graph.js";
import { centeredRect } from "./rectangle.js";
import { isEqualSet, union, symmetricDifference } from "./set-ops.js";


const drawingParameters = {
  nodeFillColor: "#FFF",
  nodeSize: 8,
  handleColor: "#888",
  handleLineWidth: 1,
  selection: {
    nodeSize: 14,
    nodeColor: "#4AF",
    nodeLineWidth: 2,
  },
  hover: {
    nodeSize: 14,
    nodeColor: "#8CF",
    nodeLineWidth: 2,
  },
  pathStrokeColor: "#BBB",
  pathLineWidth: 1,
  componentFillColor: "#FFF",
}


class Layout {
  constructor(glyphGetterFunc) {
    this._glyphGetterFunc = glyphGetterFunc;
    this.instance = null;

    this.componentsLayer = new ComponentPathItem();
    this.handlesLayer = new PathHandlesItem();
    this.pathLayer = new PathPathItem();
    this.nodesLayer = new PathNodesItem();
    this.selectionLayer = new SelectionLayer("selection")
    this.hoverLayer = new SelectionLayer("hover")

    this.scene = new SceneGraph();
    this.scene.push(this.componentsLayer);
    this.scene.push(this.handlesLayer);
    this.scene.push(this.pathLayer);
    this.scene.push(this.nodesLayer);
    this.scene.push(this.selectionLayer);
    this.scene.push(this.hoverLayer);
  }

  *_iterPathLayers() {
    yield this.handlesLayer;
    yield this.pathLayer;
    yield this.nodesLayer;
    yield this.selectionLayer;
    yield this.hoverLayer;
  }

  async setInstance(instance) {
    this.instance = instance;
    this.selectionLayer.selection = null;
    this.hoverLayer.selection = null;
    await this.updateScene();
  }

  async updateScene() {
    for (const layer of this._iterPathLayers()) {
      layer.path = this.instance.path;
    }

    if (!!this.instance.components) {
      const compoPaths = await this.instance.getComponentPaths(
        this._glyphGetterFunc, this.varLocation,
      );
      const compoPaths2d = compoPaths.map(path => {
        const path2d = new Path2D();
        path.drawToPath(path2d);
        return path2d;
      });
      this.componentsLayer.paths = compoPaths2d;
      this.selectionLayer.componentPaths = compoPaths2d;
      this.hoverLayer.componentPaths = compoPaths2d;
    } else {
      this.componentsLayer.paths = [];
      this.selectionLayer.componentPaths = [];
      this.hoverLayer.componentPaths = [];
    }
  }

  selectionAtPoint(point, size, context) {
    if (this.instance === null) {
      return null;
    }
    const selRect = centeredRect(point.x, point.y, size);
    for (const hit of this.instance.path.iterPointsInRect(selRect)) {
      return new Set([`point/${hit.pointIndex}`]);
    }
    for (let i = this.componentsLayer.paths.length - 1; i >= 0; i--) {
      const path = this.componentsLayer.paths[i];
      if (context.isPointInPath(path, point.x, point.y)) {
        return new Set([`component/${i}`]);
      }
    }
    return null;
  }

}


class MouseTracker {
  constructor(canvasController, layout) {
    this.canvasController = canvasController;
    this.layout = layout;
    this.inDrag = false;
  }

  handleMouseDown(event) {
    this.inDrag = true;
    const point = this.canvasController.localPoint(event);
    const size = this.canvasController.drawingParameters.nodeSize;
    const selection = this.layout.selectionAtPoint(point, size, this.canvasController.context);

    console.log(">>>", this.layout.hoverLayer.selection);
    if (event.shiftKey) {
      this.layout.selectionLayer.selection = symmetricDifference(this.layout.selectionLayer.selection, selection);
    } else {
      this.layout.selectionLayer.selection = selection;
    }
    console.log("<<<", this.layout.hoverLayer.selection);

    this.layout.hoverLayer.selection = null;
    this.canvasController.setNeedsUpdate();
  }

  handleMouseMove(event) {
    const point = this.canvasController.localPoint(event);
    const size = this.canvasController.drawingParameters.nodeSize;
    if (!this.inDrag) {
      const selRect = centeredRect(point.x, point.y, size);
      const selection = this.layout.selectionAtPoint(point, size, this.canvasController.context);
      if (!lenientIsEqualSet(selection, this.layout.hoverLayer.selection)) {
        this.layout.hoverLayer.selection = selection;
        this.canvasController.setNeedsUpdate();
      }
    }
  }

  handleMouseUp(event) {
    const point = this.canvasController.localPoint(event);
    this.inDrag = false;
  }

}


export class AppController {
  constructor(port = 8001) {
    const canvas = document.querySelector("#edit-canvas");

    this.remote = getRemoteProxy(`ws://localhost:${port}/`, async () => await this.initGlyphNames());
    this.canvasController = new CanvasController(canvas);
    this.canvasController.setDrawingParameters(drawingParameters);

    this._glyphsCache = {};
    this.varLocation = {};

    this.layout = new Layout(
      async glyphName => await this.getRemoteGlyph(glyphName)
    )
    this.canvasController.scene = this.layout.scene;
    canvas.addEventListener("mousemove", event => this.mouseTracker.handleMouseMove(event));
    canvas.addEventListener("mousedown", event => this.mouseTracker.handleMouseDown(event));
    canvas.addEventListener("mouseup", event => this.mouseTracker.handleMouseUp(event));

    this.mouseTracker = new MouseTracker(this.canvasController, this.layout);

    window.sliderChanged = (value, axisTag) => {
      this.setAxisValue(value, axisTag);
    };
  }

  async initGlyphNames() {
    const glyphNamesMenu = document.querySelector("#glyph-select");
    const glyphNames = await this.remote.getGlyphNames();
    for (const glyphName of glyphNames) {
      const option = document.createElement("option");
      option.setAttribute("value", glyphName);
      option.append(glyphName);
      glyphNamesMenu.appendChild(option);
    }
  }

  async glyphNameChangedCallback(glyphName) {
    const didSetGlyph = await this.setSelectedGlyph(glyphName);
    if (!didSetGlyph) {
      return;
    }
    // Rebuild axis sliders
    const axisSliders = document.querySelector("#axis-sliders");
    axisSliders.innerHTML = "";  // Delete previous sliders
    for (const axis of this.getAxisInfo()) {
      const label = document.createElement("label");
      const slider = document.createElement("input");
      label.setAttribute("class", "slider-label");
      slider.setAttribute("type", "range");
      slider.setAttribute("step", "any");
      slider.setAttribute("class", "slider");
      slider.setAttribute("min", axis.minValue);
      slider.setAttribute("max", axis.maxValue);
      slider.setAttribute("value", axis.defaultValue);
      slider.setAttribute("oninput", `sliderChanged(this.value, "${axis.name}")`);
      label.appendChild(slider);
      label.append(axis.name);
      axisSliders.appendChild(label);
    }
  }

  async setSelectedGlyph(glyphName) {
    const glyph = await this.getRemoteGlyph(glyphName);
    if (glyph === null) {
      return false;
    }
    this.glyph = glyph;
    this.varLocation = {};
    this.axisMapping = _makeAxisMapping(this.glyph.axes);
    await this._instantiateGlyph();
    this.canvasController.setNeedsUpdate();
    return true;
  }

  *getAxisInfo() {
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

  async setAxisValue(value, axisName) {
    for (const realAxisName of this.axisMapping[axisName]) {
      this.varLocation[realAxisName] = value;
    }
    await this._instantiateGlyph();
    this.canvasController.setNeedsUpdate();
  }

  async getRemoteGlyph(glyphName) {
    let glyph = this._glyphsCache[glyphName];
    if (glyph === undefined) {
      glyph = await this.remote.getGlyph(glyphName);
      if (glyph !== null) {
        glyph = VarGlyph.fromObject(glyph);
      }
      this._glyphsCache[glyphName] = glyph;
    }
    return this._glyphsCache[glyphName];
  }

  async _instantiateGlyph() {
    const instance = this.glyph.instantiate(this.varLocation);
    await this.layout.setInstance(instance);
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


function lenientIsEqualSet(set1, set2) {
  if (set1 === set2) {
    // same object, or both undefined
    return true;
  }
  if (set1 && set2 && isEqualSet(set1, set2)) {
    return true;
  }
  return false;
}
