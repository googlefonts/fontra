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
      this.sceneModel.knifeToolIntersections = getIntersections(
        glyphController,
        pointA,
        pointB
      );
      this.canvasController.requestUpdate();
    }

    delete this.sceneModel.knifeToolIntersections;
    delete this.sceneModel.knifeToolPointB;
    this.canvasController.requestUpdate();

    const glyphWidth = glyphController.xAdvance;
    const xScalePointA = pointA.x / glyphWidth;
    const xScalePointB = pointB.x / glyphWidth;

    // TODO: Multi-source editing, how do we want to implement this?
    // Today (2024/07/16) we talked in our scrum-call about 't-positioning' as a possible solution,
    // to keep the glyphs sources always compatible – even if a straight line won't be a straight cut
    // through the glyph anymore in a different layer.
    // Together with Just (after the meeting) we figured out, that this is not as easy as thought.
    // Point indicies and segments change during the loop through the first initiated intersections.

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
          // 0. Find open path points
          const openContourStartPoints = findOpenContourStartPoints(layerGlyph.path);

          const layerGlyphWidth = layerGlyph.xAdvance;
          const layerGlyphController = staticGlyphControllers[layerName];
          const line = {
            p1: { x: xScalePointA * layerGlyphWidth, y: pointA.y },
            p2: { x: xScalePointB * layerGlyphWidth, y: pointB.y },
          };
          // 1. Get intersections
          const intersections = getIntersections(
            layerGlyphController,
            line.p1,
            line.p2
          );

          // 2. Insert points and split at intersections
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
              line.p1,
              line.p2
            );
            const selection = insertPoint(
              layerGlyph.path,
              intersectionsRecalculated[i]
            );

            // split path at added points
            let { point: pointIndices } = parseSelection(selection);
            splitPathAtPointIndices(
              layerGlyph.path,
              pointIndices.sort((a, b) => a - b)
            );
          }

          // 3. Connect contours
          const [group1, group2] = getIntersectionPointIndiciesGrouped(
            layerGlyph.path,
            intersections,
            line
          );

          for (const i of range(2)) {
            const group = [group1, group2][i];
            for (const [j, oldPair] of enumerate(group)) {
              // 'Recalculation of pointIndicies' is required, because they change after connecting/merging contours
              const [group1Recalc, group2Recalc] = getIntersectionPointIndiciesGrouped(
                layerGlyph.path,
                intersections,
                line
              );
              const [pointIndex1, pointIndex2] = [group1Recalc, group2Recalc][i][j];
              connectContours(layerGlyph.path, pointIndex1, pointIndex2);
            }
          }

          // 4. Close open contours
          const [group1New, group2New] = getIntersectionPointIndiciesGrouped(
            layerGlyph.path,
            intersections,
            line
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

          // 5. Reopen contours, which were open before
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

function getIntersections(glyphController, p1, p2) {
  // NOTE: Do we want to cut components as well? If so, we would need:
  //const pathHitTester = glyphController.flattenedPathHitTester; + decompose
  const pathHitTester = glyphController.pathHitTester;
  return pathHitTester.lineIntersections(p1, p2);
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
      points: sourceContour.points.concat(targetContour.points),
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
  const comparePointIndex = pointIndex === endPointIndex ? -2 : 1;
  const c = path.getContourPoint(contourIndex, comparePointIndex);

  // cross product
  return (
    (line.p2.x - line.p1.x) * (c.y - line.p1.y) -
      (line.p2.y - line.p1.y) * (c.x - line.p1.x) >
    0
  );
}

function getPointIndiciesForIntersectionBreak(path, intersection) {
  // based on the intersection position, we can find the two points that are
  // connected to the intersection
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

function findConnectionPoint(path, pointIndex, pointIndicies, line) {
  // based on the side of the line, we can find the point which we want to connect with
  for (const pIndex of pointIndicies) {
    if (isLeftFromLine(path, line, pIndex) === isLeftFromLine(path, line, pointIndex)) {
      return pIndex;
    }
  }
}

function getIntersectionPointIndiciesGrouped(path, intersections, line) {
  // this function finds the point indicies for the intersection break and sorts them into
  // two groups, depending on the side of the line they are related to (via isLeftFromLine)
  const group1 = [];
  const group2 = [];
  for (const intersectionIndex of range(0, intersections.length, 2)) {
    // we loop every second intersection, because we want to connect the points between each other
    if (intersectionIndex + 1 >= intersections.length) {
      break;
    }

    // we have for each intersection two points (because we split the path at the intersection)
    const pointIndiciesConnection1 = getPointIndiciesForIntersectionBreak(
      path,
      intersections[intersectionIndex]
    );
    const pointIndiciesConnection2 = getPointIndiciesForIntersectionBreak(
      path,
      intersections[intersectionIndex + 1]
    );

    const pointIndex1Connection = findConnectionPoint(
      path,
      pointIndiciesConnection1[0],
      pointIndiciesConnection2,
      line
    );
    const pointIndex2Connection = findConnectionPoint(
      path,
      pointIndiciesConnection1[1],
      pointIndiciesConnection2,
      line
    );

    if (isLeftFromLine(path, line, pointIndiciesConnection1[0])) {
      group1.push([pointIndiciesConnection1[0], pointIndex1Connection]);
      group2.push([pointIndiciesConnection1[1], pointIndex2Connection]);
    } else {
      group1.push([pointIndiciesConnection1[1], pointIndex2Connection]);
      group2.push([pointIndiciesConnection1[0], pointIndex1Connection]);
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
