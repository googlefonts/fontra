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
    await this.sceneController.editGlyphAndRecordChanges(
      (glyph) => {
        const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
          glyph.layers
        );

        for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
          // Find open path points (to reopen them later)
          const openContourStartPoints = findOpenContourStartPoints(layerGlyph.path);

          // Get intersections sorted by contour and segments
          const effectedContourIndices = new Set();
          const intersectionsReordered = {};
          for (const [i, intersection] of enumerate(intersections)) {
            const contourIndex = intersection.contourIndex;
            const segmentIndex = intersection.segmentIndex;
            effectedContourIndices.add(contourIndex);
            if (!intersectionsReordered.hasOwnProperty(contourIndex)) {
              intersectionsReordered[contourIndex] = {};
            }
            if (!intersectionsReordered[contourIndex].hasOwnProperty(segmentIndex)) {
              intersection.ts = []; // create new ts for multiple intersections in one segment
              intersectionsReordered[contourIndex][segmentIndex] = intersection;
            }
            intersectionsReordered[contourIndex][segmentIndex].ts.push(intersection.t);
          }

          // Check if all contours are open, so we do not need to close them later
          let allContoursAreOpen = true;
          for (const contourIndex of effectedContourIndices) {
            const contourInfo = layerGlyph.path.contourInfo[contourIndex];
            if (contourInfo.isClosed) {
              allContoursAreOpen = false;
              break;
            }
          }

          // Insert points at intersections segments (be compatible for multi-source-editing)
          const intersectionPoints = [];
          for (const contourIndex of Object.keys(intersectionsReordered).toReversed()) {
            for (const segmentIndex of Object.keys(
              intersectionsReordered[contourIndex]
            ).toReversed()) {
              const intersectionReordered =
                intersectionsReordered[contourIndex][segmentIndex];
              const { numPointsInserted, selectedPointIndices } = insertPoint(
                layerGlyph.path,
                intersectionReordered
              );

              let intersectionIndex;
              for (const [i, intersection] of enumerate(intersections)) {
                if (
                  intersection.contourIndex === intersectionReordered.contourIndex &&
                  intersection.segmentIndex === intersectionReordered.segmentIndex
                ) {
                  intersectionIndex = i;
                  break;
                }
              }

              const tempArray = [];
              for (const pointIndex of selectedPointIndices) {
                // remembering all kind of information – is needed for later steps
                const pointInfo = {
                  recalculatedIndex: pointIndex,
                  intersectionIndex: intersectionIndex,
                  point: layerGlyph.path.getPoint(pointIndex),
                };
                tempArray.push(pointInfo);
                // Because we loop over intersectionsReordered based on
                // contourIndex and segmentIndex -> NOT intersectionIndex
                // -> we need to increase the intersectionIndex manually
                intersectionIndex++;
              }

              intersectionPoints.push(...tempArray);

              // recalculate pointIndex based on numPointsInserted
              for (const i of range(
                0,
                intersectionPoints.length - selectedPointIndices.length
              )) {
                intersectionPoints[i].recalculatedIndex =
                  intersectionPoints[i].recalculatedIndex + numPointsInserted;
              }
            }
          }

          const splitPointIndices = intersectionPoints.map(
            (point) => point.recalculatedIndex
          );

          // Split path at added points
          splitPathAtPointIndices(
            layerGlyph.path,
            splitPointIndices.sort((a, b) => a - b)
          );

          if (allContoursAreOpen) {
            // Do not connect or close contours,
            // because they all have been open before
            continue;
          }

          // Sort intersectionPoints by intersections-order
          intersectionPoints.sort((a, b) => a.intersectionIndex - b.intersectionIndex);

          // Connect contours
          const [group1, group2] = getIntersectionPointIndicesGrouped(
            layerGlyph.path,
            intersectionPoints
          );
          for (const groupIndex of range(2)) {
            const group = [group1, group2][groupIndex];
            for (const [pairIndex, oldPair] of enumerate(group)) {
              // 'Recalculation of pointindices' is required, because they change after connecting/merging contours
              const RecalcGroups = getIntersectionPointIndicesGrouped(
                layerGlyph.path,
                intersectionPoints
              );
              const [pointIndex1, pointIndex2] = RecalcGroups[groupIndex][pairIndex];
              if (
                !isStartOrEndPoint(layerGlyph.path, pointIndex1) ||
                !isStartOrEndPoint(layerGlyph.path, pointIndex2)
              ) {
                // Skip, because it's not the start or end point of the contour,
                // therefore it's very likely that it has already been connected.
                continue;
              }
              connectContours(layerGlyph.path, pointIndex1, pointIndex2);
            }
          }

          // Close open contours
          const [group1New, group2New] = getIntersectionPointIndicesGrouped(
            layerGlyph.path,
            intersectionPoints
          );

          for (const groupNew of [group1New, group2New]) {
            for (const pointPair of groupNew) {
              for (const pointIndex of pointPair) {
                const contourIndex = layerGlyph.path.getContourIndex(pointIndex);
                const contour = layerGlyph.path.contourInfo[contourIndex];
                if (contour) {
                  contour.isClosed = true;
                }
              }
            }
          }

          // Reopen contours, which were open before
          for (const pointIndex of range(layerGlyph.path.numPoints)) {
            const point = layerGlyph.path.getPoint(pointIndex);
            for (const startPoint of openContourStartPoints) {
              if (point.x === startPoint.x && point.y === startPoint.y) {
                const contourIndex = layerGlyph.path.getContourIndex(pointIndex);
                setStartPoint(layerGlyph.path, pointIndex, contourIndex);
                layerGlyph.path.contourInfo[contourIndex].isClosed = false;
                break;
              }
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
  const nearestHit = pathHitTester.findNearest(p1);
  if (nearestHit) {
    const derivative = nearestHit.segment.bezier.derivative(nearestHit.t);
    directionVector = vector.normalizeVector({
      x: -derivative.y,
      y: derivative.x,
    });

    if (shiftConstrain) {
      directionVector = constrainHorVerDiag(directionVector);
    }
  }

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

function getPointIndicesForPoint(path, point, pathPointIndicies = undefined) {
  // based on the intersection position, we can find the two points that are
  // connected to the intersection
  if (pathPointIndicies === undefined) {
    pathPointIndicies = range(path.numPoints);
  }
  let pointindices = [];
  for (const pointIndex of pathPointIndicies) {
    const p = path.getPoint(pointIndex);
    if (p.x === Math.round(point.x) && p.y === Math.round(point.y)) {
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

function getIntersectionPointIndicesGrouped(path, intersectionPoints) {
  // this function finds the point indices for the intersection break and sorts them into
  // two groups, depending on the side of the line they are related to (via isLeftFromLine)
  const group1 = [];
  const group2 = [];

  // find split pints, to reduce number of loops through all point indices
  const splitPointIndices = intersectionPoints
    .map((pointInfo) => getPointIndicesForPoint(path, pointInfo.point))
    .flat(1);

  for (const intersectionIndex of range(0, intersectionPoints.length, 2)) {
    // we have for each intersection two points (because we split the path at the intersection)
    if (intersectionIndex + 1 >= intersectionPoints.length) {
      break;
    }

    const p1 = intersectionPoints[intersectionIndex].point;
    const p2 = intersectionPoints[intersectionIndex + 1].point;
    // Because of multi-source-editing, we cannot use the initial knife tool cut line,
    // instead we use the line of the intersection points to determine the side.
    const line = { p1: p1, p2: p2 };
    const intersection1PointIndices = getPointIndicesForPoint(
      path,
      p1,
      splitPointIndices
    );

    const intersection2PointIndices = getPointIndicesForPoint(
      path,
      p2,
      splitPointIndices
    );

    const connection1PointIndex = findConnectionPoint(
      path,
      intersection1PointIndices[0],
      intersection2PointIndices,
      line
    );
    // if we found the one connection point, it must be the other:
    const connection2PointIndex =
      connection1PointIndex === intersection2PointIndices[0]
        ? intersection2PointIndices[1]
        : intersection2PointIndices[0];

    // remove all pointIndices, which are not needed anymore
    for (const pointIndex of [
      intersection1PointIndices[0],
      intersection1PointIndices[1],
      connection1PointIndex,
      connection2PointIndex,
    ]) {
      const arrayIndex = splitPointIndices.indexOf(pointIndex);
      splitPointIndices.splice(arrayIndex, 1);
    }

    if (isLeftFromLine(path, line, intersection1PointIndices[0])) {
      group1.push([intersection1PointIndices[0], connection1PointIndex]);
      group2.push([intersection1PointIndices[1], connection2PointIndex]);
    } else {
      group1.push([intersection1PointIndices[1], connection2PointIndex]);
      group2.push([intersection1PointIndices[0], connection1PointIndex]);
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
