import { getRemoteProxy } from "./remote.js";
import VarPath from "./var-path.js";
import { VarGlyph } from "./var-glyph.js";
import { CanvasController } from "./canvas-controller.js";
import { LRUCache } from "./lru-cache.js";
import {
  SceneGraph,
  ComponentsLayer,
  HandlesLayer,
  PathLayer,
  NodesLayer,
  SelectionLayer,
  RectangleSelectionLayer,
} from "./scene-graph.js";
import { centeredRect, normalizeRect, sectRect } from "./rectangle.js";
import { isEqualSet, isSuperset, union, symmetricDifference } from "./set-ops.js";
import { List } from "./ui-list.js";


const GLYPHS_LIST_CHUNK_SIZE = 200;  // the amount of glyph names added to the list at a time
const LIST_ROW_SELECTED_BACKGROUND_COLOR = "#FD7"


const drawingParameters = {
  nodeFillColor: "#777",
  nodeSize: 8,
  handleColor: "#777",
  handleLineWidth: 1,
  selection: {
    nodeSize: 10,
    nodeColor: "#4AF",
    nodeLineWidth: 2,
  },
  hover: {
    nodeSize: 10,
    nodeColor: "#8CF",
    nodeLineWidth: 2,
  },
  pathStrokeColor: "#FFF",
  pathLineWidth: 1,
  componentFillColor: "#CCC",
  rectSelectLineWidth: 1,
  rectSelectLineDash: [10, 10],
}


class Layout {
  constructor(glyphGetterFunc) {
    this._glyphGetterFunc = glyphGetterFunc;
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
        this._glyphGetterFunc, this.varLocation,
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


const MINIMAL_DRAG_DISTANCE = 10;


class RectSelectTracker {
  constructor(canvasController, layout, event) {
    this.canvasController = canvasController;
    this.layout = layout;
    this.initialX = event.pageX;
    this.initialY = event.pageY;
    this.initialPoint = canvasController.localPoint(event);
    this.currentSelection = this.layout.selectionLayer.selection;
    this.didStart = false;
  }

  handleMouseMove(event) {
    const x = event.pageX;
    const y = event.pageY;
    if (
      Math.abs(this.initialX - x) > MINIMAL_DRAG_DISTANCE ||
      Math.abs(this.initialX - x) > MINIMAL_DRAG_DISTANCE
    ) {
      this.didStart = true;
    }
    if (!this.didStart) {
      return;
    }
    const currentPoint = this.canvasController.localPoint(event);
    const selRect = normalizeRect({
      "xMin": this.initialPoint.x,
      "yMin": this.initialPoint.y,
      "xMax": currentPoint.x,
      "yMax": currentPoint.y,
    });
    const selection = this.layout.selectionAtRect(selRect);
    this.layout.rectSelectLayer.selectionRect = selRect;

    if (event.shiftKey) {
      this.layout.selectionLayer.selection = symmetricDifference(this.currentSelection, selection);
    } else {
      this.layout.selectionLayer.selection = selection;
    }

    this.canvasController.setNeedsUpdate();
  }

  handleMouseUp(event) {
    delete this.layout.rectSelectLayer.selectionRect;
    this.canvasController.setNeedsUpdate();
    delete this.currentSelection;
  }

}


class MouseTracker {
  constructor(canvasController, layout) {
    this.canvasController = canvasController;
    this.layout = layout;
    this.inDrag = false;
  }

  handleMouseDown(event) {
    if (!this.layout.canSelect()) {
      return;
    }
    // event.preventDefault();
    // this.canvasController.canvas.focus();
    this.inDrag = true;
    const point = this.canvasController.localPoint(event);
    const size = this.canvasController.drawingParameters.nodeSize;
    const selection = this.layout.selectionAtPoint(point, size, this.canvasController.context);
    let initiateDrag = false;
    let initiateRectSelect = false;

    if (selection.size > 0) {
      if (event.shiftKey) {
        this.layout.selectionLayer.selection = symmetricDifference(this.layout.selectionLayer.selection, selection);
        if (isSuperset(this.layout.selectionLayer.selection, selection)) {
          initiateDrag = true;
        }
      } else if (isSuperset(this.layout.selectionLayer.selection, selection)) {
        initiateDrag = true;
      } else {
        this.layout.selectionLayer.selection = selection;
        initiateDrag = true;
      }
    } else {
      if (!event.shiftKey) {
        this.layout.selectionLayer.selection = selection;
      }
      initiateRectSelect = true;
    }

    if (initiateRectSelect) {
      this.subTracker = new RectSelectTracker(this.canvasController, this.layout, event);
    } else if (initiateDrag) {
      console.log("let's drag stuff", initiateDrag);
    }

    this.layout.hoverLayer.selection = new Set();
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
    } else if (this.subTracker !== undefined) {
      this.subTracker.handleMouseMove(event);
    }
  }

  handleMouseUp(event) {
    const point = this.canvasController.localPoint(event);

    if (this.subTracker !== undefined) {
      this.subTracker.handleMouseUp(event);
      delete this.subTracker;
    }

    this.inDrag = false;
  }

}


export class AppController {
  constructor() {
    const canvas = document.querySelector("#edit-canvas");

    this.canvasController = new CanvasController(canvas);
    this.canvasController.setDrawingParameters(drawingParameters);

    this._glyphsCache = new LRUCache(250);
    this.varLocation = {};

    this.layout = new Layout(
      async glyphName => await this.getRemoteGlyph(glyphName)
    )
    this.canvasController.scene = this.layout.scene;
    canvas.addEventListener("mousemove", event => this.mouseTracker.handleMouseMove(event));
    canvas.addEventListener("mousedown", event => this.mouseTracker.handleMouseDown(event));
    canvas.addEventListener("mouseup", event => this.mouseTracker.handleMouseUp(event));

    // canvas.addEventListener("keydown", event => console.log(event));
    // canvas.addEventListener("keyup", event => console.log(event));

    this.mouseTracker = new MouseTracker(this.canvasController, this.layout);

    window.sliderChanged = (value, axisTag) => {
      this.setAxisValue(value, axisTag);
    };
  }

  async start(port) {
    this.remote = await getRemoteProxy(`ws://localhost:${port}/`);
    await this.initGlyphNames();
  }

  async initGlyphNames() {
    const columnDescriptions = [
      {"key": "char", "width": "2em", "get": item => getCharFromUnicode(item.unicodes[0])},
      {"key": "glyphName", "width": "10em", },
      {"key": "unicode", "width": "5em", "get": item => getUniStringFromUnicode(item.unicodes[0])},
    ];
    this.glyphNamesList = new List("glyphs-list", columnDescriptions);
    this.glyphNamesList.addEventListener("listSelectionChanged", async (event) => {
      const list = event.detail;
      const item = list.items[list.selectedItemIndex];
      await this.glyphNameChangedCallback(item.glyphName);
    });
    this.reversedCmap = await this.remote.getReversedCmap();
    this.glyphsListItems = [];
    for (const glyphName in this.reversedCmap) {
      this.glyphsListItems.push({"glyphName": glyphName, "unicodes": this.reversedCmap[glyphName]});
    }
    this.glyphsListItems.sort(glyphItemSortFunc);
    this.glyphNamesList.setItems(this.glyphsListItems);
  }

  async glyphSeachFieldChanged(value) {
    const filteredGlyphItems = this.glyphsListItems.filter(item => glyphFilterFunc(item, value));
    const selectedItem = this.glyphNamesList.getSelectedItem();
    this.glyphNamesList.setItems(filteredGlyphItems);
    this.glyphNamesList.setSelectedItem(selectedItem);
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
    this.currentGlyphName = glyphName;
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
    this.layout.resetSelection();
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
    let glyph = this._glyphsCache.get(glyphName);
    if (glyph === undefined) {
      glyph = await this.remote.getGlyph(glyphName);
      if (glyph !== null) {
        glyph = VarGlyph.fromObject(glyph);
      }
      this._glyphsCache.put(glyphName, glyph);
      // console.log("LRU size", this._glyphsCache.map.size);
    }
    return glyph;
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


function encodeGlyphName(glyphName) {
  // encode a glyph name as base64 minus padding, so it can be used
  // as a query selector
  return window.btoa(glyphName).replaceAll("=", "");
}


function getCharFromUnicode(codePoint) {
  return codePoint !== undefined ? String.fromCodePoint(codePoint) : ""

}

function getUniStringFromUnicode(codePoint) {
  return codePoint !== undefined ? "U+" + codePoint.toString(16).toUpperCase().padStart(4, "0") : ""
}

function glyphItemSortFunc(item1, item2) {
  if (item1.unicodes[0] === undefined && item2.unicodes[0] === undefined && item1.glyphName < item2.glyphName) {
    return -1;
  } else if (item1.unicodes[0] === undefined && item2.unicodes[0] !== undefined) {
    return 1;
  } else if (item1.unicodes[0] !== undefined && item2.unicodes[0] === undefined) {
    return -1;
  } else if (item1.unicodes[0] < item2.unicodes[0]) {
    return -1;
  }
  return 0;
}

function glyphFilterFunc(item, searchString) {
  if (item.glyphName.indexOf(searchString) >= 0) {
    return true;
  }
  return false;
}
