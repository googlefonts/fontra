import testGlyphs from "./test-glyphs.js";
import MathPath from "./math-path.js";


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
      drawNode(context, pt.x, pt.y, nodeSize, pt.type, pt.smooth);
    }
  }
}


class HoverLayer extends BaseSceneItem {
  constructor() {
    super();
    this.hoverItem = null;
  }

  doDraw(controller) {
    if (this.hoverItem == null) {
      return;
    }
    const context = controller.context;
    const hoverNodeSize = controller.drawingParameters.hoverNodeSize / controller.magnification
    context.save();
    context.globalCompositeOperation = "lighter";
    context.fillStyle = controller.drawingParameters.hoverNodeFillColor;
    drawNode(context, this.hoverItem.x, this.hoverItem.y, hoverNodeSize, this.hoverItem.type, this.hoverItem.smooth)
    context.restore();
  }
}


function drawNode(context, x, y, nodeSize, pointType, isSmooth) {
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
  const p = new MathPath();
  f(p);
  return p;
}

class CanvasController {

  drawingParameters = {
    nodeFillColor: "#FFF",
    nodeSize: 8,
    hoverNodeSize: 12,
    hoverNodeFillColor: "#F33",
    pathStrokeColor: "#BBB",
    pathLineWidth: 2
  }

  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.magnification = 1;
    this.origin = {x: 0, y: 800};

    this.hoverLayer = new HoverLayer()

    const lightCond = makePath(testGlyphs.lightCondensed);
    const boldCond = makePath(testGlyphs.boldCondensed);
    let delta = boldCond.subItemwise(lightCond);
    this.path = lightCond.addItemwise(delta.mulScalar(0.333));

    this.scene = new SceneGraph();
    this.scene.push(new PathPathItem(this.path));
    this.scene.push(new PathNodesItem(this.path));
    this.scene.push(this.hoverLayer);

    this.setupSize();
    window.addEventListener("resize", this.onResize.bind(this));
    canvas.addEventListener("mousemove", this.onMouseMove.bind(this));
    // canvas.addEventListener("mousedown", async (e) => this.testing(e));

    // canvas.addEventListener("wheel", this.onEvent.bind(this));
    canvas.addEventListener("wheel", (e) => this.onEvent(e));
    canvas.addEventListener("mousewheel", this.onEvent.bind(this));
    canvas.addEventListener("scroll", this.onEvent.bind(this));
    canvas.addEventListener("touchstart", this.onEvent.bind(this), false);
    canvas.addEventListener("touchmove", this.onEvent.bind(this), false);
    canvas.addEventListener("touchend", this.onEvent.bind(this), false);
    canvas.addEventListener("pointerdown", async (e) => this.testing(e), false);
    // canvas.addEventListener("pointermove", this.onEvent.bind(this), false);
    // canvas.addEventListener("pointerup", this.onEvent.bind(this), false);
    // canvas.addEventListener("pointercancel", this.onEvent.bind(this), false);
    // Safari:
    canvas.addEventListener("gesturestart", this.onEvent.bind(this));
    canvas.addEventListener("gesturechange", this.onEvent.bind(this));
    canvas.addEventListener("gestureend", this.onEvent.bind(this));

    this.draw();
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

  onResize(event) {
    this.setupSize();
    this.draw();
  }

  onMouseMove(event) {
    const point = this.localPoint(event);
    const selRect = centeredRect(
      point.x, point.y,
      this.drawingParameters.nodeSize / this.magnification,
    );
    const currentHoverItem = this.hoverLayer.hoverItem;
    this.hoverLayer.hoverItem = null;
    for (const point of this.path.iterPoints()) {
      if (pointInRect(point, selRect)) {
        this.hoverLayer.hoverItem = point;
        break;
      }
    }
    if (JSON.stringify(this.hoverLayer.hoverItem) !== JSON.stringify(currentHoverItem)) {
      this.draw(event);
    }
  }

  onEvent(event) {
    console.log(event.type, event);
    event.preventDefault();
  }

  draw(event = null) {
    let scale = window.devicePixelRatio;
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
    let x = (point.x - this.canvas.offsetLeft - this.origin.x) / this.magnification;
    let y = (point.y - this.canvas.offsetTop - this.origin.y) / -this.magnification;
    return {x: x, y: y}
  }

}


export { CanvasController };
