import { throttleCalls } from "/core/utils.js";
import * as vector from "/core/vector.js";
import { rectSize, unionRect } from "/core/rectangle.js";
import { BaseTool } from "./edit-tools-base.js";
import {
  registerVisualizationLayerDefinition,
  strokeLine,
} from "./visualization-layer-definitions.js";

let thePowerRulerTool; // singleton

registerVisualizationLayerDefinition({
  identifier: "fontra.power.ruler",
  name: "Power Ruler",
  selectionMode: "editing",
  userSwitchable: true,
  defaultOn: true,
  zIndex: 200,
  screenParameters: { strokeWidth: 1 },
  colors: {
    strokeColor: "#0004",
  },
  colorsDarkMode: {
    strokeColor: "#FFF6",
  },
  draw: (context, positionedGlyph, parameters, model, controller) =>
    thePowerRulerTool?.draw(context, positionedGlyph, parameters, model, controller),
});

export class PowerRulerTool extends BaseTool {
  iconPath = "/images/ruler.svg";
  identifier = "power-ruler-tool";

  constructor(editor) {
    super(editor);
    thePowerRulerTool = this;
    this.fontController = editor.fontController;
    this.glyphRulers = {};
    this.currentGlyphName = undefined;

    this.sceneController.addEventListener("selectedGlyphChanged", () =>
      this.editedGlyphMayHaveChanged()
    );
    this.sceneController.addEventListener("selectedGlyphIsEditingChanged", () =>
      this.editedGlyphMayHaveChanged()
    );
    editor.designspaceLocationController.addListener(
      throttleCalls(() => this.locationChanged(), 100)
    );

    this.glyphChangeListener = (glyphName) => this.glyphChanged(glyphName);
  }

  draw(context, positionedGlyph, parameters, model, controller) {
    if (!this.currentGlyphName) {
      return; // Shouldn't happen
    }
    const rulerData = this.glyphRulers[this.currentGlyphName];
    if (!rulerData) {
      return;
    }
    const { p1, p2 } = rulerData;

    context.lineWidth = parameters.strokeWidth;
    context.strokeStyle = parameters.strokeColor;
    strokeLine(context, p1.x, p1.y, p2.x, p2.y);
  }

  editedGlyphMayHaveChanged() {
    const glyphName = this.sceneController.selectedGlyphIsEditing
      ? this.sceneModel.getSelectedGlyphName()
      : undefined;
    if (glyphName !== this.currentGlyphName) {
      this.editedGlyphChanged(glyphName);
    }
  }

  editedGlyphChanged(glyphName) {
    if (this.currentGlyphName) {
      this.fontController.removeGlyphChangeListener(
        this.currentGlyphName,
        this.glyphChangeListener
      );
    }
    if (glyphName) {
      this.fontController.addGlyphChangeListener(glyphName, this.glyphChangeListener);
    }
    this.currentGlyphName = glyphName;
  }

  glyphChanged(glyphName) {
    console.log(glyphName, "changed");
  }

  locationChanged() {
    if (this.currentGlyphName) {
      console.log("locationChanged", this.currentGlyphName);
    }
  }

  handleHover(event) {
    this.setCursor();
  }

  setCursor() {
    this.canvasController.canvas.style.cursor = "default";
  }

  recalc(glyphController, point) {
    const pointRect = { xMin: point.x, yMin: point.y, xMax: point.x, yMax: point.y };
    const { width, height } = rectSize(
      unionRect(pointRect, glyphController.controlBounds)
    );
    const maxLength = Math.hypot(width, height);
    const pathHitTester = glyphController.flattenedPathHitTester;
    const nearestHit = pathHitTester.findNearest(point);
    if (nearestHit) {
      const derivative = nearestHit.segment.bezier.derivative(nearestHit.t);
      const directionVector = vector.normalizeVector({
        x: -derivative.y,
        y: derivative.x,
      });
      const p1 = vector.addVectors(point, vector.mulVector(directionVector, maxLength));
      const p2 = vector.addVectors(
        point,
        vector.mulVector(directionVector, -maxLength)
      );
      this.glyphRulers[this.currentGlyphName] = { p1, p2 };
      // console.log("dir", p1, p2);
      // console.log(nearestHit.d, nearestHit.t, nearestHit.x, nearestHit.y);
    } else {
      delete this.glyphRulers[this.currentGlyphName];
    }
    this.canvasController.requestUpdate();
  }

  async handleDrag(eventStream, initialEvent) {
    if (!this.currentGlyphName) {
      return;
    }
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    const point = this.sceneController.localPoint(initialEvent);
    point.x -= positionedGlyph.x;
    point.y -= positionedGlyph.y;
    this.recalc(positionedGlyph.glyph, point);

    // this.canvasController.canvas.style.cursor = "grabbing";
    for await (const event of eventStream) {
      if (event.x === undefined) {
        // We can receive non-pointer events like keyboard events: ignore
        continue;
      }
      const point = this.sceneController.localPoint(event);
      point.x -= positionedGlyph.x;
      point.y -= positionedGlyph.y;
      this.recalc(positionedGlyph.glyph, point);
      // this.canvasController.requestUpdate();
    }
  }
}
