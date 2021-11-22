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

    context.lineWidth = controller.drawingParameters.pathLineWidth;
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
    const nodeSize = controller.drawingParameters.nodeSize;

    context.strokeStyle = controller.drawingParameters.handleColor;
    context.lineWidth = controller.drawingParameters.handleLineWidth;
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
    const nodeSize = controller.drawingParameters.nodeSize;

    context.fillStyle = controller.drawingParameters.nodeFillColor;
    for (const pt of this.path.iterPoints()) {
      fillNode(context, pt.x, pt.y, nodeSize, pt.type, pt.smooth);
    }
  }
}


export class SelectionLayer extends BaseSceneItem {
  constructor(displayKey) {
    super();
    this.path = null;
    this.displayKey = displayKey;
    this.componentPaths;
    this.selection = null;
    this.hoverSelection = null;
  }

  doDraw(controller) {
    const selection = this.selection;
    if (selection == null || !this.path) {
      return;
    }
    const selectionStrings = Array.from(selection);
    selectionStrings.sort();

    const context = controller.context;
    const parms = controller.drawingParameters[this.displayKey];
    const hoverNodeSize = parms.nodeSize;
    const lineWidth = parms.nodeLineWidth;
    const color = parms.nodeColor;
    context.save();
    context.globalCompositeOperation = "source-over";
    context.lineJoin = "round";
    for (const selItem of selectionStrings) {
      const [tp, index] = selItem.split("/");
      if (tp === "point") {
        const point = this.path.getPoint(index);
        context.lineWidth = lineWidth;
        context.strokeStyle = color;
        strokeNode(context, point.x, point.y, hoverNodeSize, point.type, point.smooth)
      } else {
        context.lineWidth = lineWidth * 3;
        context.strokeStyle = "#0008";  // TODO tweak, put in drawingParameters
        context.stroke(this.componentPaths[index]);
        context.lineWidth = lineWidth;
        context.strokeStyle = color;
        context.stroke(this.componentPaths[index]);
      }
    }
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
