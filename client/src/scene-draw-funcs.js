export function drawMultiGlyphsLayer(model, controller) {
  if (!model.positionedLines) {
    return;
  }
  const context = controller.context;
  const selectedGlyph = model.getSelectedGlyph();
  context.fillStyle = controller.drawingParameters.glyphFillColor;
  for (const glyphLine of model.positionedLines) {
    for (const glyph of glyphLine.glyphs) {
      if (glyph === selectedGlyph) {
        continue;
      }
      context.save();
      context.translate(glyph.x, glyph.y);

      // context.fillStyle = "#CCC";
      // fillPolygon(context, glyph.glyph.convexHull);
      // context.fillStyle = controller.drawingParameters.glyphFillColor;

      context.fill(glyph.glyph.path2d);
      context.restore();
    }
  }
}


export function drawSelectedGlyphLayer(model, controller) {
  if (!model.hoveredGlyph || model.hoveredGlyph === model.selectedGlyph) {
    return;
  }
  const context = controller.context;
  const [lineIndex, glyphIndex] = model.hoveredGlyph.split("/");
  const positionedGlyph = model.positionedLines[lineIndex].glyphs[glyphIndex];
  context.lineJoin = "round";
  context.lineWidth = 10 * controller.onePixelUnit;
  context.strokeStyle = "#AAA";
  context.translate(positionedGlyph.x, positionedGlyph.y);
  context.stroke(positionedGlyph.glyph.path2d);
  context.lineWidth = 3 * controller.onePixelUnit;
  context.strokeStyle = "black";
  context.globalCompositeOperation = "destination-out"
  context.stroke(positionedGlyph.glyph.path2d);
  context.globalCompositeOperation = "source-over"
  context.fillStyle = controller.drawingParameters.glyphFillColor;
  context.fill(positionedGlyph.glyph.path2d);
}


export function drawComponentsLayer(model, controller) {
  if (!model.selectedGlyph) {
    return;
  }
  const context = controller.context;
  const positionedGlyph = model.getSelectedGlyph();

  context.translate(positionedGlyph.x, positionedGlyph.y);
  context.fillStyle = "#888"; // controller.drawingParameters.componentFillColor;
  context.fill(positionedGlyph.glyph.componentsPath2d);
}


export function drawPathLayer(model, controller) {
  if (!model.selectedGlyph) {
    return;
  }
  const context = controller.context;
  const positionedGlyph = model.getSelectedGlyph();

  context.translate(positionedGlyph.x, positionedGlyph.y);
  context.lineWidth = controller.drawingParameters.pathLineWidth;
  context.strokeStyle = controller.drawingParameters.pathStrokeColor;
  context.stroke(positionedGlyph.glyph.outlinePath2d);
}


export function drawHandlesLayer(model, controller) {
  if (!model.selectedGlyph) {
    return;
  }
  const context = controller.context;
  const positionedGlyph = model.getSelectedGlyph();
  const nodeSize = controller.drawingParameters.nodeSize;

  context.translate(positionedGlyph.x, positionedGlyph.y);
  context.strokeStyle = controller.drawingParameters.handleColor;
  context.lineWidth = controller.drawingParameters.handleLineWidth;
  for (const [pt1, pt2] of positionedGlyph.glyph.outlinePath.iterHandles()) {
    strokeLine(context, pt1.x, pt1.y, pt2.x, pt2.y);
  }
}


export function drawNodesLayer(model, controller) {
  if (!model.selectedGlyph) {
    return;
  }
  const context = controller.context;
  const positionedGlyph = model.getSelectedGlyph();
  const nodeSize = controller.drawingParameters.nodeSize;

  context.translate(positionedGlyph.x, positionedGlyph.y);
  context.fillStyle = controller.drawingParameters.nodeFillColor;
  for (const pt of positionedGlyph.glyph.outlinePath.iterPoints()) {
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
  if (!selection) {
    return;
  }
  const positionedGlyph = model.getSelectedGlyph();
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
    const items = selItem.split("/")
    const tp = items[0];
    const index = items[1];
    const glyphIndex = items[2];
    if (tp === "point") {
      const point = positionedGlyph.glyph.outlinePath.getPoint(index);
      // context.lineWidth = lineWidth;
      // context.strokeStyle = color;
      // strokeNode(context, point.x, point.y, nodeSize, point.type, point.smooth);

      context.shadowColor = "#888";
      context.shadowBlur = 8 * window.devicePixelRatio;  // shadowBlur is in device space
      context.fillStyle = parms.nodeColor;
      fillNode(context, point.x, point.y, controller.drawingParameters.nodeSize, point.type, point.smooth);
    } else if (tp === "component") {
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


function fillPolygon(context, points, isClosed = true) {
  context.fill(polygonPath(points));
}


function polygonPath(points, isClosed = true) {
  const path = new Path2D();
  if (points && points.length) {
    path.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      path.lineTo(points[i].x, points[i].y);
    }
    if (isClosed) {
      path.closePath();
    }
  }
  return path;
}
