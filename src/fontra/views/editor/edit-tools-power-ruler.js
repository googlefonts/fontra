import { range, throttleCalls } from "/core/utils.js";
import * as vector from "/core/vector.js";
import { constrainHorVerDiag } from "./edit-behavior.js";
import { BaseTool } from "./edit-tools-base.js";
import {
  registerVisualizationLayerDefinition,
  strokeLine,
} from "./visualization-layer-definitions.js";

let thePowerRulerTool; // singleton

const POWER_RULER_IDENTIFIER = "fontra.power.ruler";

registerVisualizationLayerDefinition({
  identifier: POWER_RULER_IDENTIFIER,
  name: "Power Ruler",
  selectionMode: "editing",
  userSwitchable: true,
  defaultOn: true,
  zIndex: 600,
  screenParameters: { strokeWidth: 1, fontSize: 12, intersectionRadius: 4 },
  colors: {
    strokeColor: "#0004",
    insideBlobColor: "#FFFB",
    insideTextColor: "#000B",
    outsideBlobColor: "#000B",
    outsideTextColor: "#FFFB",
    intersectionColor: "#F085",
  },
  colorsDarkMode: {
    strokeColor: "#FFF6",
    insideBlobColor: "#444B",
    insideTextColor: "#FFFB",
    outsideBlobColor: "#FFFB",
    outsideTextColor: "#444B",
    intersectionColor: "#F696",
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
    this.active = editor.visualizationLayersSettings.model[POWER_RULER_IDENTIFIER];

    this.sceneController.addEventListener("selectedGlyphChanged", () =>
      this.editedGlyphMayHaveChanged()
    );
    this.sceneController.addEventListener("selectedGlyphIsEditingChanged", () =>
      this.editedGlyphMayHaveChanged()
    );
    editor.designspaceLocationController.addKeyListener(
      "location",
      throttleCalls(() => setTimeout(() => this.locationChanged(), 0), 20)
    );

    editor.visualizationLayersSettings.addKeyListener(
      POWER_RULER_IDENTIFIER,
      (key, newValue) => {
        this.active = newValue;
        if (newValue) {
          this.recalc();
        }
      }
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
    const { intersections, measurePoints } = rulerData;
    if (intersections?.length < 2) {
      return;
    }
    const p1 = intersections[0];
    const p2 = intersections.at(-1);

    context.lineWidth = parameters.strokeWidth;
    context.strokeStyle = parameters.strokeColor;
    strokeLine(context, p1.x, p1.y, p2.x, p2.y);

    context.fillStyle = parameters.intersectionColor;
    for (const intersection of intersections) {
      fillCircle(
        context,
        intersection.x,
        intersection.y,
        parameters.intersectionRadius
      );
    }

    context.font = `bold ${parameters.fontSize}px fontra-ui-regular, sans-serif`;
    context.textAlign = "center";

    context.scale(1, -1);
    for (const measurePoint of measurePoints) {
      if (measurePoint.distance < 0.1) {
        continue;
      }
      const distance = measurePoint.distance.toString();
      context.fillStyle = measurePoint.inside
        ? parameters.insideBlobColor
        : parameters.outsideBlobColor;
      const width = context.measureText(distance).width;
      fillPill(
        context,
        measurePoint.x,
        -measurePoint.y,
        width + parameters.fontSize,
        parameters.fontSize * 1.3
      );
      context.fillStyle = measurePoint.inside
        ? parameters.insideTextColor
        : parameters.outsideTextColor;
      context.fillText(
        distance,
        measurePoint.x,
        -measurePoint.y + parameters.fontSize * 0.33
      );
    }
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
    this.canvasController.requestUpdate();
  }

  glyphChanged(glyphName) {
    this.recalc();
  }

  locationChanged() {
    if (this.currentGlyphName) {
      this.recalc();
    }
  }

  recalc() {
    if (!this.active) {
      return;
    }
    const ruler = this.glyphRulers[this.currentGlyphName];
    if (!ruler) {
      return;
    }
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    this.glyphRulers[this.currentGlyphName] = this.recalcRulerFromLine(
      positionedGlyph.glyph,
      ruler.basePoint,
      ruler.directionVector
    );
    this.canvasController.requestUpdate();
  }

  recalcRulerFromPoint(glyphController, point, shiftConstrain) {
    delete this.glyphRulers[this.currentGlyphName];
    const pathHitTester = glyphController.flattenedPathHitTester;
    const nearestHit = pathHitTester.findNearest(point);
    if (nearestHit) {
      const derivative = nearestHit.segment.bezier.derivative(nearestHit.t);
      let directionVector = vector.normalizeVector({
        x: -derivative.y,
        y: derivative.x,
      });

      if (shiftConstrain) {
        directionVector = constrainHorVerDiag(directionVector);
      }

      this.glyphRulers[this.currentGlyphName] = this.recalcRulerFromLine(
        glyphController,
        point,
        directionVector
      );
    }
    this.canvasController.requestUpdate();
  }

  recalcRulerFromLine(glyphController, basePoint, directionVector) {
    const pathHitTester = glyphController.flattenedPathHitTester;
    const intersections = pathHitTester.lineIntersections(basePoint, directionVector);
    const measurePoints = [];
    let winding = 0;
    for (const i of range(intersections.length - 1)) {
      winding += intersections[i].winding;
      const j = i + 1;
      const v = vector.subVectors(intersections[j], intersections[i]);
      const measurePoint = vector.addVectors(
        intersections[i],
        vector.mulVector(v, 0.5)
      );
      measurePoint.distance = Math.round(Math.hypot(v.x, v.y) * 10) / 10;
      measurePoint.inside = !!winding;
      measurePoints.push(measurePoint);
    }
    return {
      basePoint,
      directionVector,
      intersections,
      measurePoints,
    };
  }

  haveHoveredGlyph(event) {
    const point = this.sceneController.localPoint(event);
    return !!this.sceneModel.glyphAtPoint(point);
  }

  handleHover(event) {
    if (!this.sceneModel.selectedGlyphIsEditing || this.haveHoveredGlyph(event)) {
      this.editor.tools["pointer-tool"].handleHover(event);
      return;
    }
    this.setCursor();
  }

  setCursor() {
    if (!this.sceneModel.selectedGlyphIsEditing) {
      this.editor.tools["pointer-tool"].setCursor();
    } else {
      this.canvasController.canvas.style.cursor = "default";
    }
  }

  async handleDrag(eventStream, initialEvent) {
    if (
      !this.sceneModel.selectedGlyphIsEditing ||
      this.haveHoveredGlyph(initialEvent)
    ) {
      await this.editor.tools["pointer-tool"].handleDrag(eventStream, initialEvent);
      return;
    }
    if (!this.currentGlyphName) {
      return;
    }
    this.editor.visualizationLayersSettings.model[POWER_RULER_IDENTIFIER] = true;
    const positionedGlyph = this.sceneModel.getSelectedPositionedGlyph();
    const point = this.sceneController.localPoint(initialEvent);
    point.x -= positionedGlyph.x;
    point.y -= positionedGlyph.y;
    this.recalcRulerFromPoint(positionedGlyph.glyph, point, initialEvent.shiftKey);

    let lastPoint = point;
    for await (const event of eventStream) {
      let point;
      if (event.x === undefined) {
        // Possibly modifier key changed event
        point = lastPoint;
      } else {
        point = this.sceneController.localPoint(event);
        point.x -= positionedGlyph.x;
        point.y -= positionedGlyph.y;
        lastPoint = point;
      }
      this.recalcRulerFromPoint(positionedGlyph.glyph, point, event.shiftKey);
    }
  }

  handleKeyDown(event) {
    if (event.key === "Backspace" && this.currentGlyphName) {
      event.stopImmediatePropagation();
      delete this.glyphRulers[this.currentGlyphName];
      this.canvasController.requestUpdate();
    }
  }
}

// TODO: we need drawing-tools.js
function fillPill(context, cx, cy, length, height) {
  const radius = height / 2;
  const offset = length / 2 - radius;
  context.beginPath();
  context.arc(cx - offset, cy, radius, 0.5 * Math.PI, -0.5 * Math.PI, false);
  context.arc(cx + offset, cy, radius, -0.5 * Math.PI, 0.5 * Math.PI, false);
  context.fill();
}

function fillCircle(context, cx, cy, radius) {
  context.beginPath();
  context.arc(cx, cy, radius, 0, 2 * Math.PI, false);
  context.fill();
}
