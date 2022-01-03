import { MouseTracker } from "./mouse-tracker.js";
import { centeredRect, normalizeRect } from "./rectangle.js";
import { lenientIsEqualSet, isEqualSet, isSuperset, union, symmetricDifference } from "./set-ops.js";


export class SceneController {

  constructor(sceneModel, canvasController) {
    this.sceneModel = sceneModel;
    this.canvasController = canvasController;

    this.mouseTracker = new MouseTracker({
      drag: async (eventStream, initialEvent) => this.handleDrag(eventStream, initialEvent),
      hover: event => this.handleHover(event),
      element: canvasController.canvas,
    });
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.sceneModel.canSelect()) {
      return;
    }

    const point = this.localPoint(initialEvent);
    const initialSelection = this.selection;
    const selection = this.sceneModel.selectionAtPoint(point, this.mouseClickMargin);
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
      const selection = this.sceneModel.selectionAtRect(selRect);
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
    const selection = this.sceneModel.selectionAtPoint(point, size);
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
    return this.sceneModel.selection;
  }

  set selection(selection) {
    this.sceneModel.selection = selection;
    this.canvasController.setNeedsUpdate();
  }

  get hoverSelection() {
    return this.sceneModel.hoverSelection;
  }

  set hoverSelection(selection) {
    this.sceneModel.hoverSelection = selection;
    this.canvasController.setNeedsUpdate();
  }

  get selectionRect() {
    return this.sceneModel.selectionRect;
  }

  set selectionRect(selRect) {
    this.sceneModel.selectionRect = selRect;
    this.canvasController.setNeedsUpdate();
  }

  setDrawingParameters(drawingParameters) {
    this.canvasController.setDrawingParameters(drawingParameters);
  }

  async setSelectedGlyph(glyphName) {
    const didSetGlyph = await this.sceneModel.setSelectedGlyph(glyphName);
    if (didSetGlyph) {
      this.canvasController.setNeedsUpdate();
    }
    return didSetGlyph;
  }

  getAxisInfo() {
    return this.sceneModel.getAxisInfo();
  }

  getAxisValues() {
    return this.sceneModel.getAxisValues();
  }

  async setAxisValues(values) {
    await this.sceneModel.setAxisValues(values);
    this.canvasController.setNeedsUpdate();
  }

  getSourcesInfo() {
    return this.sceneModel.getSourcesInfo();
  }

  async setSelectedSource(sourceInfo) {
    await this.sceneModel.setSelectedSource(sourceInfo);
    this.canvasController.setNeedsUpdate();
  }
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
