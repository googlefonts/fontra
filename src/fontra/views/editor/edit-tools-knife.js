import { insertPoint, splitPathAtPointIndices } from "../core/path-functions.js";
import { PathHitTester } from "../core/path-hit-tester.js";
import { enumerate, parseSelection, range } from "../core/utils.js";
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
            const selection = insertPoint(
              layerGlyph.path,
              intersectionsRecalculated[i]
            );

            // split path at added points
            let { point: pointIndices } = parseSelection(selection);
            console.log("// split path at added points: ", pointIndices);
            splitPathAtPointIndices(
              layerGlyph.path,
              pointIndices.sort((a, b) => a - b)
            );
          }

          // connect contours
          const [group1, group2] = _getIntersectionPointIndiciesGrouped(
            layerGlyph.path,
            intersections,
            cutPointA,
            cutPointB
          );

          for (const i of range(2)) {
            const group = [group1, group2][i];
            for (const [j, oldPair] of enumerate(group)) {
              // Recalculate pointIndicies is needed, because they changed after connecting/merging contours
              const [group1Recalc, group2Recalc] = _getIntersectionPointIndiciesGrouped(
                layerGlyph.path,
                intersections,
                cutPointA,
                cutPointB
              );
              const [pointIndex1, pointIndex2] = [group1Recalc, group2Recalc][i][j];
              _connectContours(layerGlyph.path, pointIndex1, pointIndex2);
            }
          }

          // close open contours
          const [group1New, group2New] = _getIntersectionPointIndiciesGrouped(
            layerGlyph.path,
            intersections,
            cutPointA,
            cutPointB
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

function findConnectionPoint(path, pointIndex, pointIndicies, cutPointA, cutPointB) {
  for (const pIndex of pointIndicies) {
    if (
      isLeftFromLine(path, cutPointA, cutPointB, pIndex) ===
      isLeftFromLine(path, cutPointA, cutPointB, pointIndex)
    ) {
      return pIndex;
    }
  }
}

function isLeftFromLine(path, cutPointA, cutPointB, pointIndex) {
  const contourIndex = path.getContourIndex(pointIndex);
  const endPointIndex = path.contourInfo[contourIndex].endPoint;
  const comparePointIndex = pointIndex === endPointIndex ? -2 : 1;
  const c = path.getContourPoint(contourIndex, comparePointIndex);

  return (
    (cutPointB.x - cutPointA.x) * (c.y - cutPointA.y) -
      (cutPointB.y - cutPointA.y) * (c.x - cutPointA.x) >
    0
  );
}

function _getIntersectionPointIndiciesGrouped(
  path,
  intersections,
  cutPointA,
  cutPointB
) {
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

    const pointIndex1Connection = findConnectionPoint(
      path,
      pointIndiciesConnection1[0],
      pointIndiciesConnection2,
      cutPointA,
      cutPointB
    );
    const pointIndex2Connection = findConnectionPoint(
      path,
      pointIndiciesConnection1[1],
      pointIndiciesConnection2,
      cutPointA,
      cutPointB
    );

    if (isLeftFromLine(path, cutPointA, cutPointB, pointIndiciesConnection1[0])) {
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
