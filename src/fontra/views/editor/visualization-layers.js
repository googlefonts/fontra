import { enumerate, withSavedState } from "/core/utils.js";
import { mulScalar } from "/core/var-funcs.js";

export class VisualizationLayers {
  constructor() {
    this.scaleFactor = 1;
    this.darkTheme = false;
    this.visibleLayerIds = new Set();
    this.layers = [];
  }

  buildLayers() {
    const layers = [];
    for (const layerDef of visualizationLayerDefinitions) {
      if (!this.visibleLayerIds.has(layerDef.identifier)) {
        continue;
      }
      const parameters = {
        ...mulScalar(layerDef.screenParameters || {}, this.scaleFactor),
        ...(layerDef.glyphParameters || {}),
        ...(layerDef.colors || {}),
        ...(this.darkTheme && layerDef.colorsDarkMode ? layerDef.colorsDark : {}),
      };
      const layer = {
        selectionMode: layerDef.selectionMode,
        parameters: parameters,
        draw: layerDef.draw,
      };
      layers.push(layer);
    }
    this.layers = layers;
  }

  drawVisualizationLayers(model, controller) {
    const glyphsBySelectionMode = getGlyphsBySelectionMode(model);
    const context = controller.context;
    for (const layer of this.layers) {
      for (const positionedGlyph of glyphsBySelectionMode[layer.selectionMode]) {
        withSavedState(context, () => {
          context.translate(positionedGlyph.x, positionedGlyph.y);
          layer.draw(
            context,
            positionedGlyph.glyph,
            layer.parameters,
            model,
            controller
          );
        });
      }
    }
  }
}

function getGlyphsBySelectionMode(model) {
  const selectedPositionedGlyph = model.getSelectedPositionedGlyph();
  const allPositionedGlyphs = model.positionedLines.flatMap((line) => line.glyphs);
  return {
    all: allPositionedGlyphs,
    unselected: allPositionedGlyphs.filter(
      (glyph) => glyph !== selectedPositionedGlyph
    ),
    hovered:
      model.hoveredGlyph && model.hoveredGlyph !== model.selectedGlyph
        ? [model.getHoveredPositionedGlyph()]
        : [],
    selected:
      model.selectedGlyph && !model.selectedGlyphIsEditing
        ? [model.getSelectedPositionedGlyph()]
        : [],
    editing: model.selectedGlyphIsEditing ? [model.getSelectedPositionedGlyph()] : [],
  };
}

const visualizationLayerDefinitions = [];

export function registerVisualizationLayerDefinition(newLayerDef) {
  let index = -1;
  let layerDef;
  for ([index, layerDef] of enumerate(visualizationLayerDefinitions)) {
    if (newLayerDef.zIndex > layerDef.zIndex) {
      break;
    }
  }
  visualizationLayerDefinitions.splice(index + 1, 0, newLayerDef);
}

registerVisualizationLayerDefinition({
  identifier: "fontra.baseline",
  name: "Baseline",
  selectionMode: "editing",
  zIndex: 500,
  screenParameters: { strokeWidth: 1 },
  colors: { strokeColor: "#0004" },
  colorsDarkMode: { strokeColor: "#FFF6" },
  draw: (context, glyph, parameters, model, controller) => {
    context.strokeStyle = parameters.strokeColor;
    context.lineWidth = parameters.strokeWidth;
    strokeLine(context, 0, 0, glyph.xAdvance, 0);
  },
});

// Duplicated from scene-draw-funcs.js -- move to new module drawing-tools.js ?
function strokeLine(context, x1, y1, x2, y2) {
  context.beginPath();
  context.moveTo(x1, y1);
  context.lineTo(x2, y2);
  context.stroke();
}

// {
//   identifier: "fontra.baseline",
//   name: "Baseline",
//   selectionMode: "unselected",  // choice from any, unselected, hovered, selected, editing
//   zIndex: 50
//   screenParameters: {},  // in screen/pixel units
//   glyphParameters: {},  // in glyph units
//   colors: {},
//   colorsDarkMode: {},
//   draw: (context, glyph, parameters, model, controller) => { /* ... */ },
// }
