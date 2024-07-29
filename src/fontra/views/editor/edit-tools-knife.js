import { insertPoint, splitPathAtPointIndices } from "../core/path-functions.js";
import { enumerate, range } from "../core/utils.js";
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
      this.doSliceGlyph(intersections);
    }
  }

  async doSliceGlyph(intersections) {
    this.sceneController.selection = new Set(); // Clear selection
    await this.sceneController.editGlyphAndRecordChanges(
      (glyph) => {
        const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
          glyph.layers
        );
        for (const layerGlyph of Object.values(editLayerGlyphs)) {
          doCutLayerGlyph(intersections, layerGlyph);
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

function doCutLayerGlyph(intersections, layerGlyph) {
  // Get intersections sorted by contour and segments
  const intersectionsReordered = {};
  for (const [i, intersection] of enumerate(intersections)) {
    const contourIndex = intersection.contourIndex;
    const segmentIndex = intersection.segmentIndex;
    if (!intersectionsReordered.hasOwnProperty(contourIndex)) {
      intersectionsReordered[contourIndex] = {};
    }
    if (!intersectionsReordered[contourIndex].hasOwnProperty(segmentIndex)) {
      intersection.ts = []; // create new ts for multiple intersections in one segment
      intersectionsReordered[contourIndex][segmentIndex] = intersection;
    }
    intersectionsReordered[contourIndex][segmentIndex].ts.push(intersection.t);
  }

  // Insert points at intersections segments (be compatible for multi-source-editing)
  const intersectionPoints = [];
  for (const contourIndex of Object.keys(intersectionsReordered).toReversed()) {
    for (const segmentIndex of Object.keys(
      intersectionsReordered[contourIndex]
    ).toReversed()) {
      const intersectionReordered = intersectionsReordered[contourIndex][segmentIndex];
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

      const selectedPoints = [];
      for (const pointIndex of selectedPointIndices) {
        // remembering all kind of information – is needed for later steps
        const pointInfo = {
          recalculatedIndex: pointIndex,
          intersectionIndex: intersectionIndex,
          point: layerGlyph.path.getPoint(pointIndex),
          isClosed: layerGlyph.path.contourInfo[contourIndex].isClosed,
          winding: intersectionReordered.winding,
        };
        selectedPoints.push(pointInfo);
        // Because we loop over intersectionsReordered based on
        // contourIndex and segmentIndex -> NOT intersectionIndex
        // -> we need to increase the intersectionIndex manually
        intersectionIndex++;
      }

      intersectionPoints.push(...selectedPoints);

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

  // Split path at added points
  splitPathAtPointIndices(
    layerGlyph.path,
    intersectionPoints.map((point) => point.recalculatedIndex).sort((a, b) => a - b)
  );

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
      connectContours(layerGlyph.path, pointIndex1, pointIndex2);
    }
  }

  // Close open contours
  // This needs to be done a second time after connecting the contours,
  // because contour and point indices have changed meanwhile.
  const [group1New, group2New] = getIntersectionPointIndicesGrouped(
    layerGlyph.path,
    intersectionPoints
  );
  const closedContours = new Set();
  for (const groupNew of [group1New, group2New]) {
    for (const pointPair of groupNew) {
      const contourIndex = layerGlyph.path.getContourIndex(pointPair[0]);
      if (closedContours.has(contourIndex)) {
        continue;
      }
      const contour = layerGlyph.path.contourInfo[contourIndex];
      if (contour) {
        contour.isClosed = true;
        closedContours.add(contourIndex);
      }
    }
  }
}

function getIntersections(glyphController, p1, p2, shiftConstrain = undefined) {
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

function getIntersectionIndicesForConnection(intersectionPoints) {
  // ignore open contours
  const intersectionIndices = [];
  for (const [intersectionIndex, intersectionPoint] of enumerate(intersectionPoints)) {
    if (!intersectionPoint.isClosed) {
      continue;
    }
    intersectionIndices.push(intersectionIndex);
  }
  return intersectionIndices;
}

function getIntersectionPointIndicesGrouped(path, intersectionPoints) {
  // this function finds the point indices for the intersection break and sorts them into
  // two groups, depending on the side of the line they are related to (via isLeftFromLine)
  const group1 = [];
  const group2 = [];

  // find split points, to reduce number of loops through all point indices
  const splitPointIndices = intersectionPoints
    .map((pointInfo) => getPointIndicesForPoint(path, pointInfo.point))
    .flat(1);

  const intersectionIndicesDone = new Set();
  const intersectionIndices = getIntersectionIndicesForConnection(intersectionPoints);
  for (const intersectionIndex of intersectionIndices) {
    if (intersectionIndicesDone.has(intersectionIndex)) {
      continue;
    }

    let nextIntersectionIndex;
    for (const nextIndex of intersectionIndices) {
      if (intersectionIndex === nextIndex) {
        // skip if same index
        continue;
      }
      if (intersectionIndicesDone.has(nextIndex)) {
        // skip if already used
        continue;
      }
      if (
        intersectionPoints[nextIndex].winding ===
        intersectionPoints[intersectionIndex].winding
      ) {
        // skip if has the same winding direction
        continue;
      }
      nextIntersectionIndex = nextIndex;
      break;
    }
    if (nextIntersectionIndex === undefined) {
      continue;
    }

    intersectionIndicesDone.add(intersectionIndex);
    intersectionIndicesDone.add(nextIntersectionIndex);

    const inter1 = intersectionPoints[intersectionIndex].point;
    const inter2 = intersectionPoints[nextIntersectionIndex].point;

    // Because of multi-source-editing, we cannot use the initial knife tool cut line,
    // instead we use the line of the intersection points to determine the side.
    const line = { p1: inter1, p2: inter2 };
    const intersection1PointIndices = getPointIndicesForPoint(
      path,
      inter1,
      splitPointIndices
    );

    const intersection2PointIndices = getPointIndicesForPoint(
      path,
      inter2,
      splitPointIndices
    );
    const p1Index = intersection1PointIndices[0];
    const p2Index = intersection1PointIndices[1];

    const connection1PointIndex = findConnectionPoint(
      path,
      p1Index,
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
      p1Index,
      p2Index,
      connection1PointIndex,
      connection2PointIndex,
    ]) {
      const arrayIndex = splitPointIndices.indexOf(pointIndex);
      splitPointIndices.splice(arrayIndex, 1);
    }

    if (isLeftFromLine(path, line, p1Index)) {
      group1.push([p1Index, connection1PointIndex]);
      group2.push([p2Index, connection2PointIndex]);
    } else {
      group1.push([p2Index, connection2PointIndex]);
      group2.push([p1Index, connection1PointIndex]);
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
