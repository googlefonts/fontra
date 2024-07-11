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

    console.log("KnifeTool:");
    const glyphWidth = glyphController.xAdvance;
    const xScalePointA = pointA.x / glyphWidth;
    const xScalePointB = pointB.x / glyphWidth;

    // TODO: proportional scaling for y-axis
    // const lineMetrics = this.sceneModel.fontSourceInstance.lineMetricsHorizontalLayout;
    // console.log("lineMetrics.ascender: ", lineMetrics.ascender.value)
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
            // NOTE: Need to create new PathHitTester for each intersection, because the
            // number of point indices have changed after adding a new point
            const pathHitTester = new PathHitTester(
              layerGlyph.path,
              layerGlyph.controlBounds
            );
            const intersectionsRecalculated = pathHitTester.lineIntersections(
              cutPointA,
              cutPointB,
              undefined,
              []
            );
            insertPoint(layerGlyph.path, intersectionsRecalculated[i]);

            // let prevInterSection = intersections[i-1];
            // if (prevInterSection === undefined) {
            //   continue;
            //   //nextInterSection = intersections[i-1];
            // }
            // // console.log("nextInterSection:", nextInterSection);
            // // insertPoint(layerGlyph.path, nextInterSection);
            // // layerGlyph.path.appendPoint(intersectionsRecalculated[i]);
            // layerGlyph.path.appendPoint(intersection.contourIndex, {x: prevInterSection.x, y: prevInterSection.y});
          }

          // split path at added points
          const pointIndices = _findAddedPoints(layerGlyph.path, intersections);
          splitPathAtPointIndices(
            layerGlyph.path,
            pointIndices.sort((a, b) => a - b)
          );

          const pointIndicesAfterSplit = _findAddedPoints(
            layerGlyph.path,
            intersections
          );

          console.log("pointIndicesAfterSplit:", pointIndicesAfterSplit);
          //TODO: close contours, connect paths
          const collectUnpackedContours = {};
          for (const i of range(0, pointIndicesAfterSplit.length, 4)) {
            console.log(
              "connect points:",
              pointIndicesAfterSplit[i],
              pointIndicesAfterSplit[i + 2]
            );
            try {
              const [newUnpackedContour, sourceContourIndex, targetContourIndex] =
                _connectContours(
                  layerGlyph.path,
                  pointIndicesAfterSplit[i],
                  pointIndicesAfterSplit[i + 2]
                );
              console.log("newUnpackedContour:", newUnpackedContour);
              console.log("contour indicies:", sourceContourIndex, targetContourIndex);
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
          for (const i of range(1, pointIndicesAfterSplit.length, 4)) {
            console.log(
              "connect points:",
              pointIndicesAfterSplit[i],
              pointIndicesAfterSplit[i + 2]
            );
            try {
              const [newUnpackedContour, sourceContourIndex, targetContourIndex] =
                _connectContours(
                  layerGlyph.path,
                  pointIndicesAfterSplit[i],
                  pointIndicesAfterSplit[i + 2]
                );
              console.log("newUnpackedContour:", newUnpackedContour);
              const contourIndicies = [sourceContourIndex, targetContourIndex].sort();
              if (!collectUnpackedContours[contourIndicies]) {
                collectUnpackedContours[contourIndicies] = [
                  newUnpackedContour,
                  sourceContourIndex,
                  targetContourIndex,
                ];
              }
              console.log("contour indicies:", sourceContourIndex, targetContourIndex);
            } catch (error) {
              console.log("Error connecting contours:", error);
            }
          }

          console.log("collectUnpackedContours: ", collectUnpackedContours);
          const deleteContours = new Set();
          for (const [key, value] of Object.entries(collectUnpackedContours)) {
            deleteContours.add(value[1]);
            deleteContours.add(value[2]);
            layerGlyph.path.appendUnpackedContour(value[0]);
          }
          const deleteContoursArray = Array.from(deleteContours);
          deleteContoursArray.sort((a, b) => b - a); // sorted + reverse order
          console.log("deleteContoursSorted:", deleteContoursArray);
          for (const contourIndex of deleteContoursArray) {
            console.log("delete contour:", contourIndex);
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
  const [sourceContourIndex, sourceContourPointIndex] =
    path.getContourAndPointIndex(sourcePointIndex);
  const [targetContourIndex, targetContourPointIndex] =
    path.getContourAndPointIndex(targetPointIndex);
  if (sourceContourIndex == targetContourIndex) {
    // if it's the same contour -> close contour
    path.contourInfo[sourceContourIndex].isClosed = true;
  } else {
    //   connectContours(path, sourcePointIndex, targetPointIndex, );
    // }
    //Connect contours
    // const sourceContour = path.getUnpackedContour(sourceContourIndex);
    // const targetContour = path.getUnpackedContour(targetContourIndex);
    // if (!!sourceContourPointIndex == !!targetContourPointIndex) {
    //   targetContour.points.reverse();
    // }
    // sourceContour.points.splice(
    //   -0,//sourceContourPointIndex ? -1 : 0,
    //   1,
    //   ...targetContour.points
    // );
    console.log("connect points::", sourcePointIndex, targetPointIndex);

    const sourceContour = path.getUnpackedContour(sourceContourIndex);
    const targetContour = path.getUnpackedContour(targetContourIndex);
    sourceContour.points.push(...targetContour.points);
    sourceContour.isClosed = true;
    return [sourceContour, sourceContourIndex, targetContourIndex];
    // path.deleteContour(sourceContourIndex);
    // path.insertUnpackedContour(sourceContourIndex, sourceContour);
    // path.deleteContour(targetContourIndex);
    // TODO:
    // when connection the different contours, the pointIndecies change again.
    // So, the next connection will be wrong
  }
}

// TODO: There is still an issue, to sort the indicies the right way.
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
  return pathHitTester.lineIntersections(p1, p2, undefined, []);
}
