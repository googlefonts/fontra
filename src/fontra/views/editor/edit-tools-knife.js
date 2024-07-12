import { insertPoint, splitPathAtPointIndices } from "../core/path-functions.js";
import { PathHitTester } from "../core/path-hit-tester.js";
import { enumerate, range } from "../core/utils.js";
import * as vector from "../core/vector.js";
import { constrainHorVerDiag } from "./edit-behavior.js";
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

    let pointB;
    for await (const event of eventStream) {
      const point = this.sceneController.selectedGlyphPoint(event);
      if (point.x === undefined) {
        // We can receive non-pointer events like keyboard events: ignore
        continue;
      }

      if (event.shiftKey) {
        const delta = constrainHorVerDiag(vector.subVectors(point, pointA));
        pointB = vector.addVectors(pointA, delta);
      } else {
        pointB = point;
      }

      this.sceneModel.knifeToolPointB = pointB;
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
            // number of point indices have changed after adding a new point via insertPoint.
            // A reversed loop does not work, because it's possible, that the last
            // intersection is not the last point
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
          const pointIndices = _getIntersectionPointIndicies(
            layerGlyph.path,
            intersections
          );
          splitPathAtPointIndices(
            layerGlyph.path,
            pointIndices.sort((a, b) => a - b)
          );

          const [group1, group2] = _getIntersectionPointIndiciesGrouped(
            layerGlyph.path,
            intersections
          );

          for (const [i, oldPair] of enumerate(group1)) {
            // Recalculate pointIndicies is needed, because they changed after connecting/merging contours
            const [group1Recalc, group2Recalc] = _getIntersectionPointIndiciesGrouped(
              layerGlyph.path,
              intersections
            );
            const [pointIndex1, pointIndex2] = group1Recalc[i];
            _connectContours(layerGlyph.path, pointIndex1, pointIndex2);
          }
          for (const [i, oldPair] of enumerate(group2)) {
            // Recalculate pointIndicies is needed, because they changed after connecting/merging contours
            const [group1Recalc, group2Recalc] = _getIntersectionPointIndiciesGrouped(
              layerGlyph.path,
              intersections
            );
            const [pointIndex1, pointIndex2] = group2Recalc[i];
            _connectContours(layerGlyph.path, pointIndex1, pointIndex2);
          }

          // close open contours
          const [group1New, group2New] = _getIntersectionPointIndiciesGrouped(
            layerGlyph.path,
            intersections
          );
          for (const pointPair of group1New) {
            const [pointIndex1, pointIndex2] = pointPair;
            if (pointIndex1 === undefined || pointIndex2 === undefined) {
              continue;
            }
            const contourIndex1 = layerGlyph.path.getContourIndex(pointIndex1);
            const contourIndex2 = layerGlyph.path.getContourIndex(pointIndex2);
            if (contourIndex1 == contourIndex2) {
              layerGlyph.path.contourInfo[contourIndex1].isClosed = true;
            }
          }

          for (const pointPair of group2New) {
            const [pointIndex1, pointIndex2] = pointPair;
            if (pointIndex1 === undefined || pointIndex2 === undefined) {
              continue;
            }
            const contourIndex1 = layerGlyph.path.getContourIndex(pointIndex1);
            const contourIndex2 = layerGlyph.path.getContourIndex(pointIndex2);
            if (contourIndex1 == contourIndex2) {
              layerGlyph.path.contourInfo[contourIndex1].isClosed = true;
            }
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
  if (sourcePointIndex === undefined || targetPointIndex === undefined) {
    return;
  }
  const sourceContourIndex = path.getContourIndex(sourcePointIndex);
  const targetContourIndex = path.getContourIndex(targetPointIndex);
  if (sourceContourIndex == targetContourIndex) {
    // Skip, will be closed at the end.
    // In fact, we need to keep all contours open, because it's possible
    // that we connect multiple contours into one, and if one contour is
    // closed already, we get wrong outlines.
  } else {
    const sourceContour = path.getUnpackedContour(sourceContourIndex);
    const targetContour = path.getUnpackedContour(targetContourIndex);
    const newContour = {
      points: sourceContour.points.concat(targetContour.points),
      isClosed: false, // keep open, because we will close at the end
    };
    path.deleteContour(sourceContourIndex);
    path.insertUnpackedContour(sourceContourIndex, newContour);
    path.deleteContour(targetContourIndex);
  }
}

function _getIntersectionPointIndicies(path, intersections) {
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

// NOTE: This is probably the most important and also most difficult part
// of the code, because we need to find the right point connections.
function _getIntersectionPointIndiciesGroupedXXX(path, intersections) {
  const pointIndecies = [];
  for (const intersection of intersections) {
    let pointIndex1;
    let pointIndex2;
    for (const pointIndex of range(path.numPoints)) {
      if (!isNaN(pointIndex1) && !isNaN(pointIndex2)) {
        // found both points, stop loop
        break;
      }
      const point = path.getPoint(pointIndex);
      if (
        point.x === Math.round(intersection.x) &&
        point.y === Math.round(intersection.y)
      ) {
        const contourIndex = path.getContourIndex(pointIndex);
        const startPointIndex = path.getAbsolutePointIndex(contourIndex, 0);
        const endPointIndex = path.contourInfo[contourIndex].endPoint;
        if (pointIndex != startPointIndex && pointIndex != endPointIndex) {
          // skip, because this contour is connected already
          continue;
        }
        // 'point' must be either start or endpoint
        // compare point is the point, which is before or after start or end point
        const comparePointIndex = pointIndex === endPointIndex ? -2 : 1;
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
      }
    }
    pointIndecies.push(pointIndex1);
    pointIndecies.push(pointIndex2);
  }
  console.log("pointIndecies: ", pointIndecies);
  // group in paires for each connection
  const pointIndeciesGrouped = [];
  for (const rangeStartIndex of [0, 1]) {
    for (const i of range(rangeStartIndex, pointIndecies.length, 4)) {
      pointIndeciesGrouped.push([pointIndecies[i], pointIndecies[i + 2]]);
    }
  }
  console.log("pointIndeciesGrouped: ", pointIndeciesGrouped);
  return pointIndeciesGrouped;
}

function _getPointIndiciesForIntersectionBreak(path, intersection) {
  let pointIndicies = [];
  for (const pointIndex of range(path.numPoints)) {
    if (pointIndicies.length == 2) {
      break;
    }
    const point = path.getPoint(pointIndex);
    if (
      point.x === Math.round(intersection.x) &&
      point.y === Math.round(intersection.y)
    ) {
      pointIndicies.push(pointIndex);
    }
  }
  return pointIndicies;
}

function findConnectionPoint(path, pointIndex, pointIndicies) {
  const contourIndex = path.getContourIndex(pointIndex);
  const startPointIndex = path.getAbsolutePointIndex(contourIndex, 0);
  const endPointIndex = path.contourInfo[contourIndex].endPoint;

  if (pointIndex === startPointIndex) {
    for (const pIndex of pointIndicies) {
      if (pIndex === path.contourInfo[path.getContourIndex(pIndex)].endPoint) {
        return pIndex;
      }
    }
  }

  if (pointIndex === endPointIndex) {
    for (const pIndex of pointIndicies) {
      if (pIndex != path.contourInfo[path.getContourIndex(pIndex)].endPoint) {
        return pIndex;
      }
    }
  }
}

function pointIsTopLeftOriented(path, pointIndex) {
  const point1 = path.getPoint(pointIndex);
  const contourIndex = path.getContourIndex(pointIndex);
  const endPointIndex = path.contourInfo[contourIndex].endPoint;
  const comparePointIndex = pointIndex === endPointIndex ? -2 : 1;
  const point2 = path.getContourPoint(contourIndex, comparePointIndex);

  if (point2.y < point1.y) {
    return true;
  }
  if (point2.y > point1.y) {
    return false;
  }
  return point2.x < point1.x;
}

function _getIntersectionPointIndiciesGrouped(path, intersections) {
  const pointIndecies = [];
  const group1 = [];
  const group2 = [];
  for (const intersectionIndex of range(0, intersections.length, 2)) {
    if (intersectionIndex + 1 >= intersections.length) {
      break;
    }

    const pointIndiciesConnection1 = _getPointIndiciesForIntersectionBreak(
      path,
      intersections[intersectionIndex]
    );
    const pointIndiciesConnection2 = _getPointIndiciesForIntersectionBreak(
      path,
      intersections[intersectionIndex + 1]
    );
    console.log("pointIndiciesConnection1: ", pointIndiciesConnection1);
    console.log("pointIndiciesConnection2: ", pointIndiciesConnection2);
    const pointIndex1Connection = findConnectionPoint(
      path,
      pointIndiciesConnection1[0],
      pointIndiciesConnection2
    );
    const pointIndex2Connection = findConnectionPoint(
      path,
      pointIndiciesConnection1[1],
      pointIndiciesConnection2
    );
    console.log("[pointIndiciesConnection1[0], pointIndex1Connection]: ", [
      pointIndiciesConnection1[0],
      pointIndex1Connection,
    ]);
    console.log("[pointIndiciesConnection1[1], pointIndex2Connection]: ", [
      pointIndiciesConnection1[1],
      pointIndex2Connection,
    ]);
    if (pointIsTopLeftOriented(path, pointIndiciesConnection1[0])) {
      group1.push([pointIndiciesConnection1[0], pointIndex1Connection]);
      group2.push([pointIndiciesConnection1[1], pointIndex2Connection]);
      // pointIndecies.push([pointIndiciesConnection1[0], pointIndex1Connection]);
      // pointIndecies.push([pointIndiciesConnection1[1], pointIndex2Connection]);
    } else {
      group1.push([pointIndiciesConnection1[1], pointIndex2Connection]);
      group2.push([pointIndiciesConnection1[0], pointIndex1Connection]);
      pointIndecies.push([pointIndiciesConnection1[1], pointIndex2Connection]);
      pointIndecies.push([pointIndiciesConnection1[0], pointIndex1Connection]);
    }
  }
  console.log("[group1, group2]: ", [group1, group2]);
  return [group1, group2];
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
