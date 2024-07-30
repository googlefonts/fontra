import { insertPoint, splitPathAtPointIndices } from "../core/path-functions.js";
import { assert, enumerate, range, uniqueID, zip } from "../core/utils.js";
import { packContour } from "../core/var-path.js";
import * as vector from "../core/vector.js";
import { constrainHorVerDiag } from "./edit-behavior.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import {
  fillRoundNode,
  registerVisualizationLayerDefinition,
  strokeLine,
} from "./visualization-layer-definitions.js";

const intersectionIdentifierKey = "fontra.knife.tmp.intersection.identifier";

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
    for (const [i, intersection] of enumerate(intersections)) {
      intersection.sortIndex = i; // Keep the original sort order
    }

    const sortedIntersections = [...intersections];
    sortedIntersections.sort((a, b) => {
      if (a.contourIndex != b.contourIndex) {
        return b.contourIndex - a.contourIndex; // descending sort
      } else if (a.segmentIndex != b.segmentIndex) {
        return b.segmentIndex - a.segmentIndex; // descending sort
      } else {
        return a.t - b.t; // ascending sort
      }
    });

    this.sceneController.selection = new Set(); // Clear selection

    await this.sceneController.editGlyphAndRecordChanges(
      (glyph) => {
        const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
          glyph.layers
        );
        for (const layerGlyph of Object.values(editLayerGlyphs)) {
          doSliceLayerGlyph(intersections, sortedIntersections, layerGlyph.path);
        }
        return "slice glyph";
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
  return glyphController.pathHitTester.lineIntersections(p1, p2);
}

function doSliceLayerGlyph(intersections, sortedIntersections, layerPath) {
  const intersectionInfo = new Array(intersections.length);

  // Insert points
  let insertedPointIndices = [];
  for (const segmentIntersections of groupIntersectionsBySegment(sortedIntersections)) {
    const { numPointsInserted, selectedPointIndices } = insertPoint(
      layerPath,
      ...segmentIntersections
    );

    // Link point(s) to intersection(s) info via temporary point attrs
    const firstIntersection = segmentIntersections[0];

    for (const [pointIndex, intersection] of zip(
      selectedPointIndices,
      segmentIntersections
    )) {
      const point = layerPath.getPoint(pointIndex);
      assert(
        !intersectionInfo[intersection.sortIndex],
        `${intersection.sortIndex} ${intersectionInfo[intersection.sortIndex]}`
      );
      intersectionInfo[intersection.sortIndex] = {
        contourIndex: firstIntersection.contourIndex,
        contourIsClosed: layerPath.contourInfo[firstIntersection.contourIndex].isClosed,
      };
      const attrs = {
        ...point.attrs,
        [intersectionIdentifierKey]: intersection.sortIndex,
      };
      layerPath.setPointAttrs(pointIndex, attrs);
    }

    insertedPointIndices = insertedPointIndices.map(
      (pointIndex) => pointIndex + numPointsInserted
    );
    insertedPointIndices.splice(0, 0, ...selectedPointIndices);
  }

  // Split path at the insert points
  splitPathAtPointIndices(layerPath, insertedPointIndices);

  // We will now determine which intersections can be connected to other intersections

  const connectableIntersections = filterSelfIntersectingContours(
    filterOpenContours(intersections, intersectionInfo)
  );

  if (connectableIntersections.length < 2 || connectableIntersections.length % 2) {
    // We're not going to try to make sense of an odd number of intersections,
    // or there's nothing to connect
    return;
  }

  // Collect contours to be connected
  const contoursToConnect = collectContoursToConnect(layerPath);

  // If the remaining intersections are a clean run with alternating winding directions,
  // join paths, taking all remaining intersections into account. Else, we join per
  // original contour.
  const intersectionsAreClean = areIntersectionsClean(connectableIntersections);

  if (!intersectionsAreClean) {
    connectableIntersections.sort((a, b) =>
      a.contourIndex != b.contourIndex
        ? a.contourIndex - b.contourIndex
        : a.sortIndex - b.sortIndex
    );
  }

  const chainedContourIndices = chainContours(
    intersectionsAreClean,
    connectableIntersections,
    contoursToConnect
  );

  // Build new contours
  const newContours = [];
  for (const contoursToBeConnected of chainedContourIndices) {
    const newContour = { points: [], isClosed: true };
    for (const contourIndex of contoursToBeConnected) {
      const contour = layerPath.getUnpackedContour(contourIndex);
      newContour.points.push(...contour.points);
    }
    newContours.push(newContour);
  }

  const contoursToBeDeleted = [...new Set(chainedContourIndices.flat())].sort(
    (a, b) => b - a // Descending!
  );
  const contourInsertionIndex = Math.min(...chainedContourIndices.flat());

  contoursToBeDeleted.forEach((contourIndex) => layerPath.deleteContour(contourIndex));
  newContours.reverse();
  newContours.forEach((contour) =>
    layerPath.insertUnpackedContour(contourInsertionIndex, contour)
  );

  // Clean up temp point attrs
  for (const pointIndex of range(layerPath.numPoints)) {
    const point = layerPath.getPoint(pointIndex);
    if (point.attrs && intersectionIdentifierKey in point.attrs) {
      point.attrs = { ...point.attrs };
      delete point.attrs[intersectionIdentifierKey];
      layerPath.setPoint(pointIndex, point);
    }
  }
}

function* groupIntersectionsBySegment(intersections) {
  let currentGroup;
  for (const intersection of intersections) {
    if (
      currentGroup?.length &&
      intersection.contourIndex == currentGroup[0].contourIndex &&
      intersection.segmentIndex == currentGroup[0].segmentIndex
    ) {
      currentGroup.push(intersection);
    } else {
      if (currentGroup) {
        yield currentGroup;
      }
      currentGroup = [intersection];
    }
  }
  if (currentGroup) {
    yield currentGroup;
  }
}

function* groupIntersectionsByPair(intersections) {
  assert(!(intersections.length % 2), "number of intersections must be even");
  for (const i of range(0, intersections.length, 2)) {
    yield [intersections[i], intersections[i + 1]];
  }
}

function filterOpenContours(intersections, intersectionInfo) {
  return intersections.filter(
    (intersection) =>
      intersection.winding && intersectionInfo[intersection.sortIndex].contourIsClosed
  );
}

function filterSelfIntersectingContours(intersections) {
  const contourWindings = [];
  const contourSelfIntersects = [];
  for (const intersection of intersections) {
    const contourIndex = intersection.contourIndex;
    contourWindings[contourIndex] =
      (contourWindings[contourIndex] || 0) + intersection.winding;
    if (contourWindings[contourIndex] > 1 || contourWindings[contourIndex] < -1) {
      contourSelfIntersects[contourIndex] = true;
    }
  }
  return intersections.filter(
    (intersection) => !contourSelfIntersects[intersection.contourIndex]
  );
}

function collectContoursToConnect(layerPath) {
  let firstPointIndex = 0;
  const intersectionContoursRight = [];
  const intersectionContoursLeft = [];
  for (const contourIndex of range(layerPath.numContours)) {
    const lastPointIndex = layerPath.contourInfo[contourIndex].endPoint;
    const firstPoint = layerPath.getPoint(firstPointIndex);
    const lastPoint = layerPath.getPoint(lastPointIndex);

    const firstIntersectionIndex = firstPoint.attrs?.[intersectionIdentifierKey];
    const lastIntersectionIndex = lastPoint.attrs?.[intersectionIdentifierKey];

    if (firstIntersectionIndex !== undefined && lastIntersectionIndex !== undefined) {
      intersectionContoursRight[firstIntersectionIndex] = contourIndex;
      intersectionContoursLeft[lastIntersectionIndex] = contourIndex;
    }
    firstPointIndex = lastPointIndex + 1;
  }
  return { intersectionContoursRight, intersectionContoursLeft };
}

function areIntersectionsClean(intersections) {
  let currentWindingDirection;
  for (const intersection of intersections) {
    if (!intersection.winding) {
      // Sanity check, shouldn't happen
      return false;
    }
    if (currentWindingDirection === intersection.winding) {
      return false;
    }
    currentWindingDirection = intersection.winding;
  }
  return true;
}

function chainContours(
  intersectionsAreClean,
  connectableIntersections,
  contoursToConnect
) {
  const { intersectionContoursRight, intersectionContoursLeft } = contoursToConnect;
  const contourLinks = [];
  for (const [int1, int2] of groupIntersectionsByPair(connectableIntersections)) {
    if (!intersectionsAreClean && int1.contourIndex !== int2.contourIndex) {
      continue;
    }
    contourLinks[intersectionContoursLeft[int1.sortIndex]] =
      intersectionContoursRight[int2.sortIndex];
    contourLinks[intersectionContoursLeft[int2.sortIndex]] =
      intersectionContoursRight[int1.sortIndex];
  }

  let firstIndex;
  const chainedContourIndices = [];
  while ((firstIndex = contourLinks.findIndex((item) => item != null)) >= 0) {
    assert(firstIndex >= 0);
    const contourIndices = [];
    let index = firstIndex;
    for (const i of range(contourLinks.length)) {
      const next = contourLinks[index];
      if (next == null) {
        break;
      }
      contourIndices.push(index);
      contourLinks[index] = null;
      index = next;
    }
    chainedContourIndices.push(contourIndices);
  }

  return chainedContourIndices;
}

registerVisualizationLayerDefinition({
  identifier: "fontra.knifetool.line",
  name: "Knife tool line",
  selectionMode: "editing",
  zIndex: 500,
  screenParameters: { strokeWidth: 1, nodeSize: 10 },
  colors: { strokeColor: "#1118", nodeColor: "#3080FF80" },
  colorsDarkMode: { strokeColor: "#FFFB", nodeColor: "#50A0FF80" },
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
