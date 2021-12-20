import { MouseTracker } from "./mouse-tracker.js";
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
import { lenientIsEqualSet, isEqualSet, isSuperset, union, symmetricDifference } from "./set-ops.js";


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

    this.mouseTracker = new MouseTracker({
      drag: async (eventStream, initialEvent) => this.handleDrag(eventStream, initialEvent),
      hover: event => this.handleHover(event),
      element: canvasController.canvas,
    });
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.canSelect()) {
      return;
    }

    const point = this.localPoint(initialEvent);
    const initialSelection = this.selection;
    const selection = this.selectionAtPoint(point, this.mouseClickMargin);
    let initiateDrag = false;
    let initiateRectSelect = false;

    if (selection.size > 0) {
      if (event.shiftKey) {
        this.selection = symmetricDifference(this.selection, selection);
        if (isSuperset(this.selection, selection)) {
          initiateDrag = true;
        }
      } else if (isSuperset(this.selection, selection)) {
        initiateDrag = true;
      } else {
        this.selection = selection;
        initiateDrag = true;
      }
    } else {
      if (!event.shiftKey) {
        this.selection = selection;
      }
      initiateRectSelect = true;
    }

    if (initiateRectSelect || initiateDrag) {
      if (!await shouldInitiateDrag(eventStream, initialEvent)) {
        initiateRectSelect = false;
        initiateDrag = false;
      }
    }

    this.hoverSelection = new Set();

    if (initiateRectSelect) {
      return await this.handleRectSelect(eventStream, initialEvent, initialSelection);
    } else if (initiateDrag) {
      console.log("let's drag stuff", initiateDrag);
      console.log("initial event!", initialEvent);
      for await (const event of eventStream) {
        console.log("event item!", this.localPoint(event), event);
      }
      console.log("done iterating events!");
    }
  }

  async handleRectSelect(eventStream, initialEvent, initialSelection) {
    const initialPoint = this.localPoint(initialEvent);
    for await (const event of eventStream) {
      const currentPoint = this.localPoint(event);
      const selRect = normalizeRect({
        "xMin": initialPoint.x,
        "yMin": initialPoint.y,
        "xMax": currentPoint.x,
        "yMax": currentPoint.y,
      });
      const selection = this.selectionAtRect(selRect);
      this.selectionRect = selRect;

      if (event.shiftKey) {
        this.selection = symmetricDifference(initialSelection, selection);
      } else {
        this.selection = selection;
      }
    }
    this.selectionRect = undefined;
  }

  handleHover(event) {
    const point = this.localPoint(event);
    const size = this.mouseClickMargin;
    const selRect = centeredRect(point.x, point.y, size);
    const selection = this.selectionAtPoint(point, size);
    if (!lenientIsEqualSet(selection, this.hoverSelection)) {
      this.hoverSelection = selection;
    }
  }

  localPoint(event) {
    if (event.x !== undefined) {
      this._currentLocalPoint = this.canvasController.localPoint(event);
    }
    return this._currentLocalPoint;
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


const MINIMAL_DRAG_DISTANCE = 6;


async function shouldInitiateDrag(eventStream, initialEvent) {
  // drop events until the pointer moved a minimal distance
  const initialX = initialEvent.pageX;
  const initialY = initialEvent.pageY;

  for await (const event of eventStream) {
    const x = event.pageX;
    const y = event.pageY;
    if (
      Math.abs(initialX - x) > MINIMAL_DRAG_DISTANCE ||
      Math.abs(initialY - y) > MINIMAL_DRAG_DISTANCE
    ) {
      return true;
    }
  }
  return false;
}
