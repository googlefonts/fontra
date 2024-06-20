import * as rectangle from "../core/rectangle.js";
import { enumerate, parseSelection, range } from "../core/utils.js";
import { VarPackedPath, packContour } from "../core/var-path.js";
import { BaseTool, shouldInitiateDrag } from "./edit-tools-base.js";
import {
  fillRoundNode,
  registerVisualizationLayerDefinition,
} from "./visualization-layer-definitions.js";
//import transformSelection from "./panel-transformation.js";
import { ChangeCollector, applyChange, consolidateChanges } from "../core/changes.js";
import { rectCenter, rectSize } from "../core/rectangle.js";
import { Transform, prependTransformToDecomposed } from "../core/transform.js";
import { EditBehaviorFactory } from "./edit-behavior.js";
import { copyComponent } from "/core/var-glyph.js";

export class TransformationTool extends BaseTool {
  iconPath = "/tabler-icons/resize.svg";
  identifier = "transformation-tool";
  shapeNames = ["rectangle", "square"];

  handleHover(event) {
    this.setCursor();
    const mousePoint = this.sceneController.selectedGlyphPoint(event);
    //console.log("TransformationTool handleHover mousePoint: ", mousePoint);
    this.sceneModel.mousePoint = mousePoint;
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.sceneModel.selectedGlyph?.isEditing) {
      await this.editor.tools["pointer-tool"].handleDrag(eventStream, initialEvent);
      return;
    }

    const initialPoint = this.sceneController.selectedGlyphPoint(initialEvent);

    if (!(await shouldInitiateDrag(eventStream, initialEvent))) {
      // TODO: open dialog for numeric size input
      return;
    }

    const glyph = this.sceneModel.getSelectedPositionedGlyph().glyph;
    const selectionBounds = glyph.getSelectionBounds(this.sceneModel.selection);

    if (!selectionBounds) {
      return;
    }
    const selectionWidth = selectionBounds.xMax - selectionBounds.xMin;
    const selectionHeight = selectionBounds.yMax - selectionBounds.yMin;
    let scaleX = 1;
    let scaleY = 1;

    for await (const event of eventStream) {
      const point = this.sceneController.selectedGlyphPoint(event);
      if (point.x === undefined) {
        // We can receive non-pointer events like keyboard events: ignore
        continue;
      }

      const width = point.x - initialPoint.x;
      const height = point.y - initialPoint.y;

      scaleX = (selectionWidth + width) / selectionWidth;
      scaleY = (selectionHeight + height) / selectionHeight;

      transformSelection(
        this.sceneController.fontController,
        this.sceneController,
        { originX: selectionBounds.xMin, originY: selectionBounds.yMin },
        new Transform().scale(scaleX, scaleY),
        "scale"
      );

      this.sceneModel.event = event;
      this.canvasController.requestUpdate();
    }

    console.log("scaleX: ", scaleX);
    console.log("scaleY: ", scaleY);

    delete this.sceneModel.event;
    this.canvasController.requestUpdate();
  }

  deactivate() {
    this.canvasController.requestUpdate();
  }
}

// registerVisualizationLayerDefinition({
//   identifier: "fontra.bounds.selection",
//   name: "Bounds of Selection",
//   selectionMode: "editing",
//   userSwitchable: true,
//   defaultOn: true,
//   zIndex: 400,
//   screenParameters: {
//     strokeWidth: 1,
//     lineDash: [4, 4],
//     cornerSize: 8,
//     smoothSize: 8,
//     handleSize: 6.5,
//     margin: 10,
//   },

//   colors: { hoveredColor: "#BBB", selectedColor: "#FFF", underColor: "#0008" },
//   colorsDarkMode: { hoveredColor: "#BBB", selectedColor: "#000", underColor: "#FFFA" },
//   draw: (context, positionedGlyph, parameters, model, controller) => {
//     //console.log("model: ", model);
//     //console.log("controller: ", controller);
//     const glyph = positionedGlyph.glyph;
//     const selectionBounds = glyph.getSelectionBounds(model.selection);
//     if (!selectionBounds) {
//       return;
//     }
//     const selectionWidth = selectionBounds.xMax - selectionBounds.xMin;
//     const selectionHeight = selectionBounds.yMax - selectionBounds.yMin;
//     if (selectionWidth == 0 && selectionHeight == 0) {
//       // return if for example only one point is selected
//       return;
//     }

//     const mousePoint = model.mousePoint;
//     if (!mousePoint) {
//       return;
//     }
//     const mouseClickMargin = controller.mouseClickMargin;

//     context.lineWidth = parameters.strokeWidth;
//     context.strokeStyle = parameters.hoveredColor;
//     context.setLineDash(parameters.lineDash);
//     context.strokeRect(
//       selectionBounds.xMin,
//       selectionBounds.yMin,
//       selectionWidth,
//       selectionHeight
//     );

//     const [x, y, w, h] = [
//       selectionBounds.xMin - parameters.margin,
//       selectionBounds.yMin - parameters.margin,
//       selectionBounds.xMax - selectionBounds.xMin + parameters.margin * 2,
//       selectionBounds.yMax - selectionBounds.yMin + parameters.margin * 2,
//     ];

//     const cornerSize = parameters.cornerSize;
//     const smoothSize = parameters.smoothSize;
//     const handleSize = parameters.handleSize;

//     context.fillStyle = parameters.hoveredColor;
//     const corners = [
//       { x: x, y: y },
//       { x: x + w, y: y },
//       { x: x + w, y: y + h },
//       { x: x, y: y + h },
//     ];
//     const handles = [
//       { x: x + w / 2, y: y },
//       { x: x + w, y: y + h / 2 },
//       { x: x + w / 2, y: y + h },
//       { x: x, y: y + h / 2 },
//     ];

//     console.log("mousePoint: ", mousePoint);
//     for (const corner of corners) {
//       fillRoundNode(context, corner, smoothSize);
//       if (
//         corner.x - mouseClickMargin < mousePoint.x &&
//         mousePoint.x < corner.x + mouseClickMargin &&
//         corner.y - mouseClickMargin < mousePoint.y &&
//         mousePoint.y < corner.y + mouseClickMargin
//       ) {
//         console.log("YES it's a corner: ", corner);
//         context.fillStyle = parameters.selectedColor;
//         fillRoundNode(context, corner, smoothSize * 2);
//       }
//     }
//     for (const handle of handles) {
//       fillRoundNode(context, handle, handleSize);
//     }
//     // fillRoundNode(context, { x: x, y: y }, smoothSize);
//     // fillRoundNode(context, { x: x + w / 2, y: y }, smoothSize);
//     // fillRoundNode(context, { x: x + w, y: y }, smoothSize);
//     // fillRoundNode(context, { x: x, y: y + h / 2 }, smoothSize);
//     // fillRoundNode(context, { x: x + w, y: y + h / 2 }, smoothSize);
//     // fillRoundNode(context, { x: x, y: y + h }, smoothSize);
//     // fillRoundNode(context, { x: x + w / 2, y: y + h }, smoothSize);
//     // fillRoundNode(context, { x: x + w, y: y + h }, smoothSize);
//   },
// });

async function transformSelection(
  fontController,
  sceneController,
  transformParameters,
  transformation,
  undoLabel
) {
  let {
    point: pointIndices,
    component: componentIndices,
    anchor: anchorIndices,
  } = parseSelection(sceneController.selection);

  pointIndices = pointIndices || [];
  componentIndices = componentIndices || [];
  anchorIndices = anchorIndices || [];
  if (!pointIndices.length && !componentIndices.length && !anchorIndices.length) {
    return;
  }

  const staticGlyphControllers = await _getStaticGlyphControllers(
    fontController,
    sceneController
  );

  await sceneController.editGlyph((sendIncrementalChange, glyph) => {
    const layerInfo = Object.entries(
      sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
    ).map(([layerName, layerGlyph]) => {
      const behaviorFactory = new EditBehaviorFactory(
        layerGlyph,
        sceneController.selection,
        sceneController.experimentalFeatures.scalingEditBehavior
      );
      return {
        layerName,
        changePath: ["layers", layerName, "glyph"],
        layerGlyphController: staticGlyphControllers[layerName],
        editBehavior: behaviorFactory.getBehavior("default", true),
      };
    });

    const editChanges = [];
    const rollbackChanges = [];
    for (const { changePath, editBehavior, layerGlyphController } of layerInfo) {
      const layerGlyph = layerGlyphController.instance;
      const pinPoint = _getPinPoint(
        sceneController,
        layerGlyphController,
        transformParameters.originX,
        transformParameters.originY
      );

      const t = new Transform()
        .translate(pinPoint.x, pinPoint.y)
        .transform(transformation)
        .translate(-pinPoint.x, -pinPoint.y);

      const pointTransformFunction = t.transformPointObject.bind(t);

      const componentTransformFunction = (component, componentIndex) => {
        component = copyComponent(component);
        component.transformation = prependTransformToDecomposed(
          t,
          component.transformation
        );
        return component;
      };

      const editChange = editBehavior.makeChangeForTransformFunc(
        pointTransformFunction,
        null,
        componentTransformFunction
      );
      applyChange(layerGlyph, editChange);
      editChanges.push(consolidateChanges(editChange, changePath));
      rollbackChanges.push(consolidateChanges(editBehavior.rollbackChange, changePath));
    }

    let changes = ChangeCollector.fromChanges(
      consolidateChanges(editChanges),
      consolidateChanges(rollbackChanges)
    );

    return {
      changes: changes,
      undoLabel: undoLabel,
      broadcast: true,
    };
  });
}

async function _getStaticGlyphControllers(fontController, sceneController) {
  const varGlyphController =
    await sceneController.sceneModel.getSelectedVariableGlyphController();

  const editingLayers = sceneController.getEditingLayerFromGlyphLayers(
    varGlyphController.layers
  );
  const staticGlyphControllers = {};
  for (const [i, source] of enumerate(varGlyphController.sources)) {
    if (source.layerName in editingLayers) {
      staticGlyphControllers[source.layerName] =
        await fontController.getLayerGlyphController(
          varGlyphController.name,
          source.layerName,
          i
        );
    }
  }
  return staticGlyphControllers;
}

function _getPinPoint(sceneController, layerGlyphController, originX, originY) {
  const bounds = layerGlyphController.getSelectionBounds(sceneController.selection);
  const { width, height } = rectSize(bounds);

  // default from center
  let pinPointX = bounds.xMin + width / 2;
  let pinPointY = bounds.yMin + height / 2;

  if (typeof originX === "number") {
    pinPointX = originX;
  } else if (originX === "left") {
    pinPointX = bounds.xMin;
  } else if (originX === "right") {
    pinPointX = bounds.xMax;
  }

  if (typeof originY === "number") {
    pinPointY = originY;
  } else if (originY === "top") {
    pinPointY = bounds.yMax;
  } else if (originY === "bottom") {
    pinPointY = bounds.yMin;
  }

  return { x: pinPointX, y: pinPointY };
}
