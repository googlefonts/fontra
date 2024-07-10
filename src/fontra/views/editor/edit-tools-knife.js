import * as rectangle from "../core/rectangle.js";
import { range } from "../core/utils.js";
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
    cutPath(pointA, pointB);
  }

  async cutPath(pointA, pointB) {
    this.sceneController.selection = new Set(); // Clear selection

    // await this.sceneController.editGlyphAndRecordChanges(
    //   (glyph) => {
    //     const editLayerGlyphs = this.sceneController.getEditingLayerFromGlyphLayers(
    //       glyph.layers
    //     );

    //     for (const [layerName, layerGlyph] of Object.entries(editLayerGlyphs)) {
    //       layerGlyph.path.appendPath(pathNew);
    //       const intersection = getIntersections(
    //         glyphController,
    //         pointA,
    //         pointB
    //       );
    //     }
    //     return `Knife Tool cut`;
    //   },
    //   undefined,
    //   true
    // );
  }

  deactivate() {
    this.canvasController.requestUpdate();
  }
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
