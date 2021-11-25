import { getRemoteProxy } from "./remote.js";
import VarPath from "./var-path.js";
import { VarGlyph } from "./var-glyph.js";
import { CanvasController } from "./canvas-controller.js";
import {
  SceneGraph,
  ComponentsLayer,
  HandlesLayer,
  PathLayer,
  NodesLayer,
  SelectionLayer,
  RectangleSelectionLayer,
} from "./scene-graph.js";
import { centeredRect, normalizeRect } from "./rectangle.js";
import { isEqualSet, isSuperset, union, symmetricDifference } from "./set-ops.js";


const GLYPHS_LIST_CHUNK_SIZE = 200;  // the amount of glyph names added to the list at a time


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

  async updateScene() {
    for (const layer of this._iterPathLayers()) {
      layer.path = this.instance.path;
    }

    let compoPaths2d = [];
    if (!!this.instance.components) {
      const compoPaths = await this.instance.getComponentPaths(
        this._glyphGetterFunc, this.varLocation,
      );
      compoPaths2d = compoPaths.map(path => {
        const path2d = new Path2D();
        path.drawToPath(path2d);
        return path2d;
      });
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

  selectionAtRect(selRect, context) {
    const selection = new Set();
    for (const hit of this.instance.path.iterPointsInRect(selRect)) {
      selection.add(`point/${hit.pointIndex}`);
    }
    // TODO: implement for components
    // for (let i = this.componentsLayer.paths.length - 1; i >= 0; i--) {
    //   const path = this.componentsLayer.paths[i];
    //   if (context.isPointInPath(path, point.x, point.y)) {
    //     selection.add(`component/${i}`);
    //   }
    // }
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
    this.currentSelection = this.layout.selectionLayer.selection;
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
    const selection = this.layout.selectionAtRect(selRect, this.canvasController.context);
    this.layout.rectSelectLayer.selectionRect = selRect;
    // TODO: take shift / command keys into account
    this.layout.selectionLayer.selection = selection;
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
    console.log("drag?", initiateDrag);
    console.log("rect select?", initiateRectSelect);

    if (initiateRectSelect) {
      this.subTracker = new RectSelectTracker(this.canvasController, this.layout, event);
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

    // canvas.addEventListener("keydown", event => console.log(event));
    // canvas.addEventListener("keyup", event => console.log(event));

    this.mouseTracker = new MouseTracker(this.canvasController, this.layout);

    window.sliderChanged = (value, axisTag) => {
      this.setAxisValue(value, axisTag);
    };
  }

  async initGlyphNames() {
    this.glyphNames = await this.remote.getGlyphNames();
    const glyphsList = document.querySelector("#glyphs-list");
    const glyphsListWrapper = document.querySelector("#glyphs-list-wrapper");

    glyphsListWrapper.addEventListener("keydown", async event => {
      event.preventDefault();
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }
      const selectedRow = document.querySelector(`#glyph-${encodeGlyphName(this.currentGlyphName)}`)
      if (selectedRow) {
        let glyphRow;
        if (event.key === "ArrowUp") {
          glyphRow = selectedRow.previousElementSibling;
        } else {
          glyphRow = selectedRow.nextElementSibling;
        }
        if (glyphRow) {
          await this._selectGlyphByRowElement(glyphRow);
        }
      }
      event.preventDefault();
    });

    glyphsListWrapper.addEventListener("scroll", async event => {
      if (
        this.glyphNamesBackLog.length > 0 &&
        glyphsListWrapper.scrollTop + glyphsListWrapper.offsetHeight + 200 > glyphsList.offsetHeight
      ) {
        // adding more glyph names
        await this._appendGlyphNames(this.glyphNamesBackLog.splice(0, GLYPHS_LIST_CHUNK_SIZE));
      }
    }, false)

    this.glyphNamesBackLog = Array.from(this.glyphNames);
    await this._appendGlyphNames(this.glyphNamesBackLog.splice(0, GLYPHS_LIST_CHUNK_SIZE));
  }

  async _appendGlyphNames(glyphNames) {
    const glyphsList = document.querySelector("#glyphs-list");
    for (const glyphName of glyphNames) {
      const glyphRow = document.createElement("div");
      glyphRow.setAttribute("class", "glyph-name");
      glyphRow.setAttribute("id", `glyph-${encodeGlyphName(glyphName)}`);
      glyphRow.setAttribute("glyphname", glyphName);
      glyphRow.append(glyphName);
      glyphRow.addEventListener("click", async event => this._selectGlyphByRowElement(glyphRow));
      glyphsList.appendChild(glyphRow);
    }
  }

  async _selectGlyphByRowElement(glyphRow) {
    const glyphName = glyphRow.getAttribute("glyphname");
    const currentGlyphName = this.currentGlyphName;
    if (glyphName === currentGlyphName) {
      return;
    }
    glyphRow.setAttribute("style", "background-color: #FD7;");
    try {
      await this.glyphNameChangedCallback(glyphName);
    } catch (error) {
      glyphRow.setAttribute("style", "background-color: #FFF;");
      throw(error);
    }

    if (currentGlyphName !== undefined) {
      const selectedRow = document.querySelector(`#glyph-${encodeGlyphName(currentGlyphName)}`)
      if (selectedRow) {
        selectedRow.setAttribute("style", "background-color: #FFF;");
      }
    }
  }

  async glyphSeachFieldChanged(value) {
    const glyphsList = document.querySelector("#glyphs-list");
    this.glyphNamesBackLog = this.glyphNames.filter(glyphName => glyphName.indexOf(value) >= 0);
    glyphsList.innerHTML = "";
    await this._appendGlyphNames(this.glyphNamesBackLog.splice(0, GLYPHS_LIST_CHUNK_SIZE));
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


function encodeGlyphName(glyphName) {
  // encode a glyph name as base64 minus padding, so it can be used
  // as a query selector
  return window.btoa(glyphName).replaceAll("=", "");
}
