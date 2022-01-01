export function drawComponentsLayer(model, controller) {
  const context = controller.context;

  context.fillStyle = controller.drawingParameters.componentFillColor;
  model.componentPaths?.forEach(path => context.fill(path));
}


export function drawPathLayer(model, controller) {
  if (!model.path) {
    return;
  }
  const context = controller.context;

  context.lineWidth = controller.drawingParameters.pathLineWidth;
  context.strokeStyle = controller.drawingParameters.pathStrokeColor;
  context.stroke(model.path2d);
}


export function drawHandlesLayer(model, controller) {
  if (!model.path) {
    return;
  }
  const context = controller.context;
  const nodeSize = controller.drawingParameters.nodeSize;

  context.strokeStyle = controller.drawingParameters.handleColor;
  context.lineWidth = controller.drawingParameters.handleLineWidth;
  for (const [pt1, pt2] of model.path.iterHandles()) {
    strokeLine(context, pt1.x, pt1.y, pt2.x, pt2.y);
  }
}


export function drawNodesLayer(model, controller) {
  if (!model.path) {
    return;
  }
  const context = controller.context;
  const nodeSize = controller.drawingParameters.nodeSize;

  context.fillStyle = controller.drawingParameters.nodeFillColor;
  for (const pt of model.path.iterPoints()) {
    fillNode(context, pt.x, pt.y, nodeSize, pt.type, pt.smooth);
  }
}


export function drawSelectionLayer(model, controller) {
  _drawSelectionLayer("selection", model.selection, model, controller)
}


export function drawHoverLayer(model, controller) {
  _drawSelectionLayer("hover", model.hoverSelection, model, controller)
}


function _drawSelectionLayer(displayKey, selection, model, controller) {
  if (!selection || !model.path) {
    return;
  }
  const selectionStrings = Array.from(selection);
  selectionStrings.sort();

  const context = controller.context;
  const parms = controller.drawingParameters[displayKey];
  const nodeSize = parms.nodeSize;
  const lineWidth = parms.nodeLineWidth;
  const color = parms.nodeColor;
  context.save();
  context.globalCompositeOperation = "source-over";
  context.lineJoin = "round";
  for (const selItem of selectionStrings) {
    const [tp, index] = selItem.split("/");
    if (tp === "point") {
      const point = model.path.getPoint(index);
      // context.lineWidth = lineWidth;
      // context.strokeStyle = color;
      // strokeNode(context, point.x, point.y, nodeSize, point.type, point.smooth);

      context.shadowColor = "#888";
      context.shadowBlur = 8 * window.devicePixelRatio;  // shadowBlur is in device space
      context.fillStyle = parms.nodeColor;
      fillNode(context, point.x, point.y, controller.drawingParameters.nodeSize, point.type, point.smooth);
    } else {
      context.save();
      context.shadowColor = "#888";
      context.shadowBlur = 18 * window.devicePixelRatio;  // shadowBlur is in device space
      // context.shadowOffsetX = 2;
      // context.shadowOffsetY = 2;
      context.fillStyle = parms.componentFillColor;;
      context.fill(model.componentPaths[index]);
      context.restore();
    }
  }
  context.restore();
}


export function drawRectangleSelectionLayer(model, controller) {
  if (model.selectionRect === undefined) {
    return;
  }
  const selRect = model.selectionRect;
  const context = controller.context;
  const x = selRect.xMin;
  const y = selRect.yMin;
  const w = selRect.xMax - x;
  const h = selRect.yMax - y;
  context.lineWidth = controller.drawingParameters.rectSelectLineWidth;
  context.strokeStyle = "#000";
  context.strokeRect(x, y, w, h);
  context.strokeStyle = "#FFF";
  context.setLineDash(controller.drawingParameters.rectSelectLineDash);
  context.strokeRect(x, y, w, h);
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
