import { insertPoint, splitPathAtPointIndices } from "../core/path-functions.js";
import { PathHitTester } from "../core/path-hit-tester.js";
import { enumerate, parseSelection, range } from "../core/utils.js";
import { packContour } from "../core/var-path.js";
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
    let shiftConstrain;
    let intersections;
    for await (const event of eventStream) {
      const point = this.sceneController.selectedGlyphPoint(event);
      if (point.x === undefined) {
        // We can receive non-pointer events like keyboard events: ignore
        continue;
      }

      if (event.shiftKey) {
        const delta = constrainHorVerDiag(vector.subVectors(point, pointA));
        pointB = vector.addVectors(pointA, delta);
        shiftConstrain = true;
      } else {
        pointB = point;
      }

      this.sceneModel.knifeToolPointB = pointB;
      this.sceneModel.knifeToolIntersections = intersections = getIntersections(
        glyphController,
        pointA,
        pointB
      );
      this.canvasController.requestUpdate();
    }

    delete this.sceneModel.knifeToolPointB;
    delete this.sceneModel.knifeToolIntersections;
    this.canvasController.requestUpdate();

    if (intersections.length >= 1) {
      this.doCutPath(intersections);
    }
  }

  async doCutPath(intersections) {
    this.sceneController.selection = new Set(); // Clear selection
    const staticGlyphControllers =
      await this.sceneController.getStaticGlyphControllers();
    await this.sceneController.editGlyphAndRecordChanges(
      (glyph) => {
        const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
          glyph.layers
        );

        for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
          // 0. Find open path points
          const openContourStartPoints = findOpenContourStartPoints(layerGlyph.path);

          // 1. Get intersections sorted by contour and segments
          const intersectionsReordered = {};
          for (const intersection of intersections) {
            if (!intersectionsReordered.hasOwnProperty(intersection.contourIndex)) {
              intersectionsReordered[intersection.contourIndex] = {};
            }
            const segmentIndex = intersection.segmentIndex;
            if (
              !intersectionsReordered[intersection.contourIndex].hasOwnProperty(
                segmentIndex
              )
            ) {
              intersection.ts = []; // create new ts for multiple intersections in one segment
              intersectionsReordered[intersection.contourIndex][segmentIndex] =
                intersection;
            }
            intersectionsReordered[intersection.contourIndex][segmentIndex].ts.push(
              intersection.t
            );
          }

          // 2. Insert points at intersections
          const intersectionPointIncices = [];
          for (const contourIndex of Object.keys(intersectionsReordered).toReversed()) {
            for (const segmentIndex of Object.keys(
              intersectionsReordered[contourIndex]
            ).toReversed()) {
              const { numPointsInserted, selectedPointIndices } = insertPoint(
                layerGlyph.path,
                intersectionsReordered[contourIndex][segmentIndex]
              );

              intersectionPointIncices.push(...selectedPointIndices);
              // recalculate pointIndex based on numPointsInserted
              for (const i of range(0, intersectionPointIncices.length - 1)) {
                intersectionPointIncices[i] =
                  intersectionPointIncices[i] + numPointsInserted;
              }
            }
          }

          // 3. split path at added points
          splitPathAtPointIndices(
            layerGlyph.path,
            intersectionPointIncices.sort((a, b) => a - b)
          );

          continue;

          // // 3. Connect contours
          // const [group1, group2] = getIntersectionPointindicesGrouped(
          //   layerGlyph.path,
          //   intersections,
          //   line
          // );

          // for (const groupIndex of range(2)) {
          //   const group = [group1, group2][groupIndex];
          //   for (const [pairIndex, oldPair] of enumerate(group)) {
          //     // 'Recalculation of pointindices' is required, because they change after connecting/merging contours
          //     const RecalcGroups = getIntersectionPointindicesGrouped(
          //       layerGlyph.path,
          //       intersections,
          //       line
          //     );
          //     const [pointIndex1, pointIndex2] = RecalcGroups[groupIndex][pairIndex];
          //     if (
          //       !isStartOrEndPoint(layerGlyph.path, pointIndex1) ||
          //       !isStartOrEndPoint(layerGlyph.path, pointIndex2)
          //     ) {
          //       // Skip, because it's not the start or end point of the contour,
          //       // therefore it's very likely that it has already been connected.
          //       continue;
          //     }
          //     connectContours(layerGlyph.path, pointIndex1, pointIndex2);
          //   }
          // }

          // // 4. Close open contours
          // const [group1New, group2New] = getIntersectionPointindicesGrouped(
          //   layerGlyph.path,
          //   intersections,
          //   line
          // );

          // for (const groupNew of [group1New, group2New]) {
          //   for (const pointPair of groupNew) {
          //     for (const pointIndex of pointPair) {
          //       const contourIndex = layerGlyph.path.getContourIndex(pointIndex);
          //       const contour = layerGlyph.path.contourInfo[contourIndex];
          //       if (contour) {
          //         contour.isClosed = true;
          //       }
          //     }
          //   }
          // }

          // // 5. Reopen contours, which were open before
          // for (const pointIndex of range(layerGlyph.path.numPoints)) {
          //   const point = layerGlyph.path.getPoint(pointIndex);
          //   for (const startPoint of openContourStartPoints) {
          //     if (point.x === startPoint.x && point.y === startPoint.y) {
          //       const contourIndex = layerGlyph.path.getContourIndex(pointIndex);
          //       setStartPoint(layerGlyph.path, pointIndex, contourIndex);
          //       layerGlyph.path.contourInfo[contourIndex].isClosed = false;
          //       break;
          //     }
          //   }
          // }
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

function isStartOrEndPoint(path, pointIndex) {
  if (pointIndex === undefined) {
    return false;
  }
  const contourIndex = path.getContourIndex(pointIndex);
  const endPointIndex = path.contourInfo[contourIndex].endPoint;
  const startPointIndex = path.getAbsolutePointIndex(contourIndex, 0);
  if (pointIndex != endPointIndex && pointIndex != startPointIndex) {
    return false;
  }
  return true;
}

function getIntersections(glyphController, p1, p2, shiftConstrain = undefined) {
  // NOTE: Do we want to cut components as well? If so, we would need:
  //const pathHitTester = glyphController.flattenedPathHitTester; + decompose
  const pathHitTester = glyphController.pathHitTester;

  // this whole winding direction part is actually not needed for the knife tool
  // but keep it for now, because we were wondering why all intersections had no winding
  let directionVector;
  // const nearestHit = pathHitTester.findNearest(p1);
  // if (nearestHit) {
  //   const derivative = nearestHit.segment.bezier.derivative(nearestHit.t);
  //   directionVector = vector.normalizeVector({
  //     x: -derivative.y,
  //     y: derivative.x,
  //   });

  //   if (shiftConstrain) {
  //     directionVector = constrainHorVerDiag(directionVector);
  //   }
  // }

  return pathHitTester.lineIntersections(p1, p2, directionVector);
}

function findOpenContourStartPoints(path) {
  const collectPointStarts = new Set();
  for (const i of range(path.numContours)) {
    const contourInfo = path.contourInfo[i];
    if (contourInfo.isClosed) {
      continue;
    }

    const startPoint = path.getContourPoint(i, 0);
    collectPointStarts.add(startPoint);
  }
  return collectPointStarts;
}

function setStartPoint(path, pointIndex, contourIndex) {
  // This is almost a copy from setStartPoint() scene-controller.js
  // With a few exceptions only, eg. don't scipt open contours.
  const contourToPointMap = new Map();
  const contourStartPoint = path.getAbsolutePointIndex(contourIndex, 0);
  contourToPointMap.set(contourIndex, pointIndex - contourStartPoint);

  contourToPointMap.forEach((contourPointIndex, contourIndex) => {
    if (contourPointIndex === 0) {
      // Already start point
      return;
    }

    const contour = path.getUnpackedContour(contourIndex);
    const head = contour.points.splice(0, contourPointIndex);
    contour.points.push(...head);
    path.deleteContour(contourIndex);
    path.insertContour(contourIndex, packContour(contour));
  });
}

function connectContours(path, sourcePointIndex, targetPointIndex) {
  // NOTE: We need to keep all contours open, because it's possible that we
  // connect multiple contours into one (example @), and if one contour is
  // closed before we want to add another contour, we get wrong outlines.
  if (sourcePointIndex === undefined || targetPointIndex === undefined) {
    return;
  }
  const sourceContourIndex = path.getContourIndex(sourcePointIndex);
  const targetContourIndex = path.getContourIndex(targetPointIndex);
  if (sourceContourIndex == targetContourIndex) {
    // Skip, will be closed at the end.
  } else {
    const sourceContour = path.getUnpackedContour(sourceContourIndex);
    const targetContour = path.getUnpackedContour(targetContourIndex);

    const newContour = {
      points:
        sourcePointIndex === path.contourInfo[sourceContourIndex].endPoint
          ? sourceContour.points.concat(targetContour.points)
          : targetContour.points.concat(sourceContour.points),
      isClosed: false, // keep open, will be closed at the end
    };

    path.deleteContour(sourceContourIndex);
    path.insertUnpackedContour(sourceContourIndex, newContour);
    path.deleteContour(targetContourIndex);
  }
}

function isLeftFromLine(path, line, pointIndex) {
  // the intersection point is on the line, therefore we need to check
  // the previous or next point to determine the side
  const contourIndex = path.getContourIndex(pointIndex);
  const endPointIndex = path.contourInfo[contourIndex].endPoint;

  let comparePointIndex = pointIndex === endPointIndex ? -2 : 1;
  const numPoints = path.getNumPointsOfContour(contourIndex);
  if (numPoints === 2) {
    // if the contour has two points only, use the other
    comparePointIndex = pointIndex === endPointIndex ? 0 : -1;
  }
  const c = path.getContourPoint(contourIndex, comparePointIndex);

  // cross product
  return (
    (line.p2.x - line.p1.x) * (c.y - line.p1.y) -
      (line.p2.y - line.p1.y) * (c.x - line.p1.x) >
    0
  );
}

function getPointindicesForIntersectionBreak(path, intersection) {
  // based on the intersection position, we can find the two points that are
  // connected to the intersection
  let pointindices = [];
  for (const pointIndex of range(path.numPoints)) {
    if (pointindices.length == 2) {
      break;
    }
    const point = path.getPoint(pointIndex);
    if (
      point.x === Math.round(intersection.x) &&
      point.y === Math.round(intersection.y)
    ) {
      pointindices.push(pointIndex);
    }
  }
  return pointindices;
}

function findConnectionPoint(path, pointIndex, pointindices, line) {
  // based on the side of the line, we can find the point which we want to connect with
  if (pointIndex === undefined) {
    return undefined;
  }
  for (const pIndex of pointindices) {
    if (isLeftFromLine(path, line, pIndex) === isLeftFromLine(path, line, pointIndex)) {
      return pIndex;
    }
  }
}

function getIntersectionPointindicesGrouped(path, intersections, line) {
  // this function finds the point indices for the intersection break and sorts them into
  // two groups, depending on the side of the line they are related to (via isLeftFromLine)
  const group1 = [];
  const group2 = [];
  for (const intersectionIndex of range(0, intersections.length, 2)) {
    // we loop every second intersection, because we want to connect the points between each other
    if (intersectionIndex + 1 >= intersections.length) {
      break;
    }
    // we have for each intersection two points (because we split the path at the intersection)
    const pointindicesConnection1 = getPointindicesForIntersectionBreak(
      path,
      intersections[intersectionIndex]
    );
    const pointindicesConnection2 = getPointindicesForIntersectionBreak(
      path,
      intersections[intersectionIndex + 1]
    );

    const pointIndex1Connection = findConnectionPoint(
      path,
      pointindicesConnection1[0],
      pointindicesConnection2,
      line
    );
    // if we found the one connection point, it must be the other:
    const pointIndex2Connection =
      pointIndex1Connection === pointindicesConnection2[0]
        ? pointindicesConnection2[1]
        : pointindicesConnection2[0];

    if (isLeftFromLine(path, line, pointindicesConnection1[0])) {
      group1.push([pointindicesConnection1[0], pointIndex1Connection]);
      group2.push([pointindicesConnection1[1], pointIndex2Connection]);
    } else {
      group1.push([pointindicesConnection1[1], pointIndex2Connection]);
      group2.push([pointindicesConnection1[0], pointIndex1Connection]);
    }
  }

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
    for (const intersection of model.knifeToolIntersections) {
      fillRoundNode(context, intersection, parameters.nodeSize);
    }
  },
});
