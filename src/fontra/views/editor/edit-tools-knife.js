import {
  connectContours,
  insertPoint,
  splitPathAtPointIndices,
} from "../core/path-functions.js";
import { PathHitTester } from "../core/path-hit-tester.js";
import * as rectangle from "../core/rectangle.js";
import { enumerate, parseSelection, range, reversed } from "../core/utils.js";
import { VarPackedPath, packContour } from "../core/var-path.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import {
  fillRoundNode,
  registerVisualizationLayerDefinition,
  strokeLine,
} from "./visualization-layer-definitions.js";

export class KnifeTool extends BaseTool {
  iconPath = "/tabler-icons/slice.svg";
  identifier = "knife-tool";

  setCursor() {
    if (this.sceneModel.selectedGlyph?.isEditing) {
      this.canvasController.canvas.style.cursor = "crosshair";
    }
  }

  handleHover(event) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      this.editor.tools["pointer-tool"].handleHover(event);
      return;
    }
    this.setCursor();
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      await this.editor.tools["pointer-tool"].handleDrag(eventStream, initialEvent);
      return;
    }

    if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
      // TODO: open dialog for numeric size input
      return;
    }

    const pointA = this.sceneController.selectedGlyphPoint(initialEvent);
    this.sceneModel.knifeToolPointA = pointA;
    const glyphController = await this.sceneModel.getSelectedStaticGlyphController();

    let eventTemp;
    let pointB;
    for await (const event of eventStream) {
      eventTemp = event;
      const point = this.sceneController.selectedGlyphPoint(event);
      if (point.x === undefined) {
        // We can receive non-pointer events like keyboard events: ignore
        continue;
      }

      this.sceneModel.knifeToolPointB = pointB = point;
      this.sceneModel.intersections = getIntersections(glyphController, pointA, pointB);
      this.sceneModel.event = event;
      this.canvasController.requestUpdate();
    }

    delete this.sceneModel.intersections;
    delete this.sceneModel.knifeToolPointB;
    delete this.sceneModel.event;
    this.canvasController.requestUpdate();

    const glyphWidth = glyphController.xAdvance;
    const xScalePointA = pointA.x / glyphWidth;
    const xScalePointB = pointB.x / glyphWidth;

    // TODO: DO we want proportional scaling for y-axis as well?
    // const lineMetrics = this.sceneModel.fontSourceInstance.lineMetricsHorizontalLayout;
    // const glyphHeight = lineMetrics.ascender.value;
    // const yScalePointA = pointA.y / glyphHeight;
    // const yScalePointB = pointB.y / glyphHeight;

    this.doCutPath(pointA, pointB, xScalePointA, xScalePointB);
  }

  async doCutPath(pointA, pointB, xScalePointA, xScalePointB) {
    this.sceneController.selection = new Set(); // Clear selection
    const staticGlyphControllers =
      await this.sceneController.getStaticGlyphControllers();
    await this.sceneController.editGlyphAndRecordChanges(
      (glyph) => {
        const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
          glyph.layers
        );

        for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
          const layerGlyphWidth = layerGlyph.xAdvance;
          const layerGlyphController = staticGlyphControllers[layerName];
          const cutPointA = { x: xScalePointA * layerGlyphWidth, y: pointA.y };
          const cutPointB = { x: xScalePointB * layerGlyphWidth, y: pointB.y };
          const intersections = getIntersections(
            layerGlyphController,
            cutPointA,
            cutPointB
          );

          // insert points at intersections
          for (const [i, intersection] of enumerate(intersections)) {
            // INFO: Need to create new PathHitTester for each intersection, because the
            // number of point indices have changed after adding a new point via insertPoint
            const pathHitTester = new PathHitTester(
              layerGlyph.path,
              layerGlyph.controlBounds
            );
            const intersectionsRecalculated = pathHitTester.lineIntersections(
              cutPointA,
              cutPointB
            );
            insertPoint(layerGlyph.path, intersectionsRecalculated[i]);
          }

          // split path at added points
          const pointIndices = _findAddedPoints(layerGlyph.path, intersections);
          splitPathAtPointIndices(
            layerGlyph.path,
            pointIndices.sort((a, b) => a - b)
          );

          // At given point pairs make copy of connected contours, so we can add it later.
          // Connect them in a loop won't work, because contours change, when we connect them.
          const pointIndicesGrouped = _findAddedPointsGrouped(
            layerGlyph.path,
            intersections
          );
          const collectUnpackedContours = {};
          for (const pair of pointIndicesGrouped) {
            try {
              const [newUnpackedContour, sourceContourIndex, targetContourIndex] =
                _connectContours(layerGlyph.path, pair[0], pair[1]);
              const contourIndicies = [sourceContourIndex, targetContourIndex].sort();
              if (!collectUnpackedContours[contourIndicies]) {
                collectUnpackedContours[contourIndicies] = [
                  newUnpackedContour,
                  sourceContourIndex,
                  targetContourIndex,
                ];
              }
            } catch (error) {
              console.log("Error connecting contours:", error);
            }
          }

          // add connected contours to path
          const deleteContours = new Set();
          for (const [key, value] of Object.entries(collectUnpackedContours)) {
            deleteContours.add(value[1]);
            deleteContours.add(value[2]);
            layerGlyph.path.appendUnpackedContour(value[0]);
          }

          // remove previours contours
          const deleteContoursArray = Array.from(deleteContours);
          deleteContoursArray.sort((a, b) => b - a); // sort + reverse order
          for (const contourIndex of deleteContoursArray) {
            layerGlyph.path.deleteContour(contourIndex);
          }
        }

        return `Knife Tool cut`;
      },
      undefined,
      true
    );
  }

  deactivate() {
    this.canvasController.requestUpdate();
  }
}

function _connectContours(path, sourcePointIndex, targetPointIndex) {
  const sourceContourIndex = path.getContourIndex(sourcePointIndex);
  const targetContourIndex = path.getContourIndex(targetPointIndex);
  if (sourceContourIndex == targetContourIndex) {
    // if it's the same contour -> close contour
    path.contourInfo[sourceContourIndex].isClosed = true;
  } else {
    const sourceContour = path.getUnpackedContour(sourceContourIndex);
    const targetContour = path.getUnpackedContour(targetContourIndex);
    sourceContour.points.push(...targetContour.points);
    sourceContour.isClosed = true;

    // INFO: When connecting the different contours, the pointIndecies change, therefore
    // would be wrong, why we return the outline with contourIndcisies to be removed later.
    return [sourceContour, sourceContourIndex, targetContourIndex];
  }
}

function _findAddedPoints(path, intersections) {
  const pointIndecies = [];
  for (const intersection of intersections) {
    for (const pointIndex of range(path.numPoints)) {
      const point = path.getPoint(pointIndex);
      if (
        point.x === Math.round(intersection.x) &&
        point.y === Math.round(intersection.y)
      ) {
        pointIndecies.push(pointIndex);
      }
    }
  }
  return pointIndecies;
}

// NOTE: This is probably the most important and also most difficult
// part of the code, because we need to find the right point connections.
function _findAddedPointsGrouped(path, intersections) {
  const pointIndecies = [];
  for (const intersection of intersections) {
    let pointIndex1;
    let pointIndex2;
    for (const pointIndex of range(path.numPoints)) {
      const point = path.getPoint(pointIndex);
      if (
        point.x === Math.round(intersection.x) &&
        point.y === Math.round(intersection.y)
      ) {
        // 'point' must be either start or endpoint
        const contourIndex = path.getContourIndex(pointIndex);
        const contourInfo = path.contourInfo[contourIndex];
        let comparePointIndex = 1; // after StartPoint
        if (contourInfo.endPoint === pointIndex) {
          comparePointIndex = -2; // before endPoint
        }
        const comparePoint = path.getContourPoint(contourIndex, comparePointIndex);
        if (comparePoint.y != point.y) {
          if (comparePoint.y > point.y) {
            pointIndex1 = pointIndex;
          } else {
            pointIndex2 = pointIndex;
          }
        } else {
          if (comparePoint.x > point.x) {
            pointIndex1 = pointIndex;
          } else {
            pointIndex2 = pointIndex;
          }
        }

        if (!isNaN(pointIndex1) && !isNaN(pointIndex2)) {
          pointIndecies.push(pointIndex1);
          pointIndecies.push(pointIndex2);
          break;
        }
      }
    }
  }

  // group in paires for each connection
  const pointIndeciesGrouped = [];
  for (const i of range(0, pointIndecies.length, 4)) {
    pointIndeciesGrouped.push([pointIndecies[i], pointIndecies[i + 2]]);
  }
  for (const i of range(1, pointIndecies.length, 4)) {
    pointIndeciesGrouped.push([pointIndecies[i], pointIndecies[i + 2]]);
  }

  return pointIndeciesGrouped;
}

registerVisualizationLayerDefinition({
  identifier: "fontra.knifetool.line",
  name: "Knife tool line",
  selectionMode: "editing",
  zIndex: 500,
  screenParameters: { strokeWidth: 1, nodeSize: 5 },
  colors: { strokeColor: "#1118", nodeColor: "#000", color: "#000" },
  colorsDarkMode: { strokeColor: "#FFFB", nodeColor: "#FFF", color: "#FFF" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const pointA = model.knifeToolPointA;
    const pointB = model.knifeToolPointB;
    if (!pointA || !pointB) {
      return;
    }

    context.strokeStyle = parameters.strokeColor;
    context.lineWidth = parameters.strokeWidth;
    strokeLine(context, pointA.x, pointA.y, pointB.x, pointB.y);

    context.fillStyle = parameters.nodeColor;
    for (const intersection of model.intersections) {
      fillRoundNode(context, intersection, parameters.nodeSize);
    }
  },
});

function getIntersections(glyphController, p1, p2) {
  // NOTE: Do we want to cut components as well? If so, we would need:
  //const pathHitTester = glyphController.flattenedPathHitTester;
  const pathHitTester = glyphController.pathHitTester;
  return pathHitTester.lineIntersections(p1, p2);
}
