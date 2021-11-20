import testGlyphs from "./test-glyphs.js";
import VarPath from "./var-path.js";
import { VarGlyph } from "./var-glyph.js";
import { VariationModel } from "./var-model.js";

const MIN_MAGNIFICATION = 0.05;
const MAX_MAGNIFICATION = 200;


class BaseSceneItem {
  constructor() {
    this.hidden = false;
  }

  draw(controller) {
    if (!this.hidden) {
      this.doDraw(controller)
    }
  }
}


class SceneGraph extends BaseSceneItem {
  constructor() {
    super();
    this.items = [];
  }

  push(item) {
    this.items.push(item)
  }

  doDraw(controller) {
    for (const item of this.items) {
      item.draw(controller);
    }
  }
}


class PathPathItem extends BaseSceneItem {
  constructor(path) {
    super();
    this.path = path;
  }

  doDraw(controller) {
    const context = controller.context;
    const points = this.path;
    const path2d = new Path2D();
    this.path.drawToPath(path2d);

    context.lineWidth = controller.drawingParameters.pathLineWidth / controller.magnification;
    context.strokeStyle = controller.drawingParameters.pathStrokeColor;
    context.stroke(path2d);
  }
}


class PathHandlesItem extends BaseSceneItem {
  constructor(path) {
    super();
    this.path = path;
  }

  doDraw(controller) {
    const context = controller.context;
    const nodeSize = controller.drawingParameters.nodeSize / controller.magnification

    context.strokeStyle = controller.drawingParameters.handleColor;
    context.lineWidth = controller.drawingParameters.handleLineWidth / controller.magnification;
    for (const [pt1, pt2] of this.path.iterHandles()) {
      strokeLine(context, pt1.x, pt1.y, pt2.x, pt2.y);
    }
  }
}


class PathNodesItem extends BaseSceneItem {
  constructor(path) {
    super();
    this.path = path;
  }

  doDraw(controller) {
    const context = controller.context;
    const nodeSize = controller.drawingParameters.nodeSize / controller.magnification

    context.fillStyle = controller.drawingParameters.nodeFillColor;
    for (const pt of this.path.iterPoints()) {
      fillNode(context, pt.x, pt.y, nodeSize, pt.type, pt.smooth);
    }
  }
}


class HoverLayer extends BaseSceneItem {
  constructor(path) {
    super();
    this.path = path
    this.hoverSelection = null;
  }

  doDraw(controller) {
    if (this.hoverSelection == null) {
      return;
    }
    const context = controller.context;
    const hoverNodeSize = controller.drawingParameters.hoverNodeSize / controller.magnification
    context.save();
    context.globalCompositeOperation = "lighter";
    context.strokeStyle = controller.drawingParameters.hoverNodeColor;
    context.lineWidth = controller.drawingParameters.hoverNodeLineWidth / controller.magnification;
    const point = this.path.getPoint(this.hoverSelection);
    strokeNode(context, point.x, point.y, hoverNodeSize, point.type, point.smooth)
    context.restore();
  }
}


function fillNode(context, x, y, nodeSize, pointType, isSmooth) {
  if (pointType) {
    context.beginPath();
    context.arc(x, y, nodeSize / 2, 0, 2 * Math.PI, false);
    context.fill();
  } else {
    context.fillRect(
      x - nodeSize / 2,
      y - nodeSize / 2,
      nodeSize,
      nodeSize
    );
  }
}

function strokeNode(context, x, y, nodeSize, pointType, isSmooth) {
  if (pointType) {
    context.beginPath();
    context.arc(x, y, nodeSize / 2, 0, 2 * Math.PI, false);
    context.stroke();
  } else {
    context.strokeRect(
      x - nodeSize / 2,
      y - nodeSize / 2,
      nodeSize,
      nodeSize
    );
  }
}

function strokeLine(context, x1, y1, x2, y2) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}


function strokeHLine(context, x1, x2, y) {
  context.beginPath();
  context.moveTo(x1, y);
  context.lineTo(x2, y);
  context.stroke();
}


function pointInRect(point, rect) {
  return (point.x >= rect.xMin && point.x <= rect.xMax && point.y >= rect.yMin && point.y <= rect.yMax);
}


function centeredRect(x, y, side) {
  const halfSide = side / 2;
  return {
    xMin: x - halfSide,
    yMin: y - halfSide,
    xMax: x + halfSide,
    yMax: y + halfSide
  }
}


function makePath(f) {
  const p = new VarPath();
  f(p);
  return p;
}

class CanvasController {

  drawingParameters = {
    nodeFillColor: "#FFF",
    nodeSize: 8,
    handleColor: "#888",
    handleLineWidth: 1,
    hoverNodeSize: 14,
    hoverNodeColor: "#48F",
    hoverNodeLineWidth: 2,
    pathStrokeColor: "#BBB",
    pathLineWidth: 1
  }

  constructor(canvas, remote) {
    this.canvas = canvas;
    this.remote = remote;
    this.context = canvas.getContext("2d");
    this.magnification = 1;
    this.origin = {x: 0, y: 800};
    this.needsUpdate = false;

    const locations = [{}, {wght: 1}, {wdth: 1}, {wght: 1, wdth: 1}];
    this.model = new VariationModel(locations);
    const masterValues = [
      makePath(testGlyphs.lightCondensed).coordinates,
      makePath(testGlyphs.boldCondensed).coordinates,
      makePath(testGlyphs.lightWide).coordinates,
      makePath(testGlyphs.boldWide).coordinates,
    ];
    this.deltas = this.model.getDeltas(masterValues);
    this.varLocation = {};
    this.path = makePath(testGlyphs.lightCondensed);

    this.scene = new SceneGraph();
    this.scene.push(new PathHandlesItem(this.path));
    this.scene.push(new PathPathItem(this.path));
    this.scene.push(new PathNodesItem(this.path));
    this.hoverLayer = new HoverLayer(this.path)
    this.scene.push(this.hoverLayer);

    this.setupSize();
    window.addEventListener("resize", event => this.handleResize(event));
    canvas.addEventListener("mousemove", event => this.handleMouseMove(event));
    canvas.addEventListener("wheel", event => this.handleWheel(event));

    // Safari pinch zoom:
    canvas.addEventListener("gesturestart", event => this.handleSafariGestureStart(event));
    canvas.addEventListener("gesturechange", event => this.handleSafariGestureChange(event));
    canvas.addEventListener("gestureend", event => this.handleSafariGestureEnd(event));

    // canvas.addEventListener("mousedown", async (e) => this.testing(e));
    // canvas.addEventListener("scroll", this.onEvent.bind(this));
    // canvas.addEventListener("touchstart", this.onEvent.bind(this), false);
    // canvas.addEventListener("touchmove", this.onEvent.bind(this), false);
    // canvas.addEventListener("touchend", this.onEvent.bind(this), false);
    // canvas.addEventListener("pointerdown", async (e) => this.testing(e), false);
    // canvas.addEventListener("pointermove", this.onEvent.bind(this), false);
    // canvas.addEventListener("pointerup", this.onEvent.bind(this), false);
    // canvas.addEventListener("pointercancel", this.onEvent.bind(this), false);

    this.setNeedsUpdate();
  }

  async setGlyph(glyphName) {
    let glyph = await this.remote.getGlyph(glyphName);
    if (glyph === null) {
      return;
    }
    this.varLocation = {};
    this.glyph = VarGlyph.fromObject(glyph);
    const inst = this.glyph.instantiate({});
    this.path.coordinates = inst.path.coordinates;
    this.path.pointTypes = inst.path.pointTypes;
    this.path.contours = inst.path.contours;
    this.setNeedsUpdate();
  }

  setAxisValue(value, axisIndex) {
    const axis = this.glyph.axes[axisIndex];
    if (axis === undefined) {
      return;
    }
    this.varLocation[axis.name] = value;
    const inst = this.glyph.instantiate(this.varLocation);
    this.path.coordinates = inst.path.coordinates;
    this.path.pointTypes = inst.path.pointTypes;
    this.path.contours = inst.path.contours;
    this.setNeedsUpdate();
  }

  async testing(event) {
    console.log("testing async 1");
    await new Promise(r => setTimeout(r, 500));
    console.log("testing async 2");
  }

  setupSize() {
    let width = this.canvas.parentElement.getBoundingClientRect().width;
    let height = this.canvas.parentElement.getBoundingClientRect().height;

    let scale = window.devicePixelRatio; // Change to 1 on retina screens to see blurry canvas.
    this.canvas.width = Math.floor(width * scale);
    this.canvas.height = Math.floor(height * scale);
    this.canvas.style.width = width;
    this.canvas.style.height = height;
  }

  handleResize(event) {
    this.setupSize();
    this.setNeedsUpdate();
  }

  handleMouseMove(event) {
    const point = this.localPoint(event);
    const selRect = centeredRect(
      point.x, point.y,
      this.drawingParameters.nodeSize / this.magnification,
    );
    const currentHoverSelection = this.hoverLayer.hoverSelection;
    this.hoverLayer.hoverSelection = null;
    let index = 0;
    for (const point of this.path.iterPoints()) {
      if (pointInRect(point, selRect)) {
        this.hoverLayer.hoverSelection = index;
        break;
      }
      index++;
    }
    if (this.hoverLayer.hoverSelection !== currentHoverSelection) {
      this.setNeedsUpdate();
    }
  }

  handleWheel(event) {
    event.preventDefault();
    if (event.ctrlKey) {
      this._doPinchMagnify(event, 1 - event.deltaY / 100);
    } else {
      if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        this.origin.x -= event.deltaX;
      } else {
        this.origin.y -= event.deltaY;
      }
      this.setNeedsUpdate();
    }
  }

  handleSafariGestureStart(event) {
    event.preventDefault();
    this._initialMagnification = this.magnification;
    this._doPinchMagnify(event, event.scale);
  }

  handleSafariGestureChange(event) {
    event.preventDefault();
    const zoomFactor = this._initialMagnification * event.scale / this.magnification;
    this._doPinchMagnify(event, zoomFactor);
  }

  handleSafariGestureEnd(event) {
    event.preventDefault();
    delete this._initialMagnification;
  }

  _doPinchMagnify(event, zoomFactor) {
    const center = this.localPoint({x: event.pageX, y: event.pageY});
    const prevMagnification = this.magnification;

    this.magnification = this.magnification * zoomFactor;
    this.magnification = Math.min(Math.max(this.magnification, MIN_MAGNIFICATION), MAX_MAGNIFICATION);

    // adjust origin
    this.origin.x += (1 - zoomFactor) * center.x * prevMagnification;
    this.origin.y -= (1 - zoomFactor) * center.y * prevMagnification;
    this.setNeedsUpdate();
  }

  onEvent(event) {
    console.log(event.type, event);
    event.preventDefault();
  }

  setNeedsUpdate() {
    if (!this.needsUpdate) {
      this.needsUpdate = true;
      setTimeout(() => this.draw(), 0);
    }
  }

  draw() {
    this.needsUpdate = false;
    const scale = window.devicePixelRatio;
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.context.save();
    this.context.scale(scale, scale);
    this.context.translate(this.origin.x, this.origin.y);
    this.context.scale(this.magnification, -this.magnification);
    this.scene.draw(this);
    this.context.restore();
  }

  // helpers

  localPoint(point) {
    const x = (point.x - this.canvas.offsetLeft - this.origin.x) / this.magnification;
    const y = -(point.y - this.canvas.offsetTop - this.origin.y) / this.magnification;
    return {x: x, y: y}
  }

}


export { CanvasController };
