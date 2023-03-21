import { withSavedState } from "/core/utils.js";
import { mulScalar } from "/core/var-funcs.js";

export class VisualizationLayers {
  constructor(darkTheme, definitions) {
    this.darkTheme = darkTheme;
    this.definitions = definitions;
    this.scaleFactor = 1;
    this.layers = [];
    this.visibleLayerIds = new Set(
      this.definitions
        .filter((layer) => !layer.userSwitchable)
        .map((layer) => layer.identifier)
    );
  }

  buildLayers() {
    const layers = [];
    for (const layerDef of this.definitions) {
      if (!this.visibleLayerIds.has(layerDef.identifier)) {
        continue;
      }
      const parameters = {
        ...mulScalar(layerDef.screenParameters || {}, this.scaleFactor),
        ...(layerDef.glyphParameters || {}),
        ...(layerDef.colors || {}),
        ...(this.darkTheme && layerDef.colorsDarkMode ? layerDef.colorsDarkMode : {}),
      };
      const layer = {
        selectionMode: layerDef.selectionMode,
        selectionFilter: layerDef.selectionFilter,
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
      const glyphs = layer.selectionFilter
        ? glyphsBySelectionMode[layer.selectionMode].filter(layer.selectionFilter)
        : glyphsBySelectionMode[layer.selectionMode];
      for (const positionedGlyph of glyphs) {
        withSavedState(context, () => {
          context.translate(positionedGlyph.x, positionedGlyph.y);
          layer.draw(context, positionedGlyph, layer.parameters, model, controller);
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
