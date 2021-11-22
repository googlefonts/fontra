export class BaseSceneItem {
  constructor() {
    this.hidden = false;
  }

  draw(controller) {
    if (!this.hidden) {
      this.doDraw(controller)
    }
  }
}


export class SceneGraph extends BaseSceneItem {
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


export class ComponentPathItem extends BaseSceneItem {
  constructor(paths) {
    super();
    this.paths = paths || [];
  }

  doDraw(controller) {
    const context = controller.context;

    context.fillStyle = controller.drawingParameters.componentFillColor;
    for (const path of this.paths) {
      context.fill(path);
    }
  }
}


export class PathPathItem extends BaseSceneItem {
  constructor(path) {
    super();
    this.path = path;
  }

  doDraw(controller) {
    if (!this.path) {
      return;
    }
    const context = controller.context;
    const points = this.path;
    const path2d = new Path2D();
    this.path.drawToPath(path2d);

    context.lineWidth = controller.drawingParameters.pathLineWidth / controller.magnification;
    context.strokeStyle = controller.drawingParameters.pathStrokeColor;
    context.stroke(path2d);
  }
}


export class PathHandlesItem extends BaseSceneItem {
  constructor(path) {
    super();
    this.path = path;
  }

  doDraw(controller) {
    if (!this.path) {
      return;
    }
    const context = controller.context;
    const nodeSize = controller.drawingParameters.nodeSize / controller.magnification

    context.strokeStyle = controller.drawingParameters.handleColor;
    context.lineWidth = controller.drawingParameters.handleLineWidth / controller.magnification;
    for (const [pt1, pt2] of this.path.iterHandles()) {
      strokeLine(context, pt1.x, pt1.y, pt2.x, pt2.y);
    }
  }
}


export class PathNodesItem extends BaseSceneItem {
  constructor(path) {
    super();
    this.path = path;
  }

  doDraw(controller) {
    if (!this.path) {
      return;
    }
    const context = controller.context;
    const nodeSize = controller.drawingParameters.nodeSize / controller.magnification

    context.fillStyle = controller.drawingParameters.nodeFillColor;
    for (const pt of this.path.iterPoints()) {
      fillNode(context, pt.x, pt.y, nodeSize, pt.type, pt.smooth);
    }
  }
}


export class HoverLayer extends BaseSceneItem {
  constructor(path) {
    super();
    this.path = path
    this.hoverSelection = null;
  }

  doDraw(controller) {
    if (this.hoverSelection == null || !this.path) {
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


export function pointInRect(point, rect) {
  return (point.x >= rect.xMin && point.x <= rect.xMax && point.y >= rect.yMin && point.y <= rect.yMax);
}


export function centeredRect(x, y, side) {
  const halfSide = side / 2;
  return {
    xMin: x - halfSide,
    yMin: y - halfSide,
    xMax: x + halfSide,
    yMax: y + halfSide
  }
}
