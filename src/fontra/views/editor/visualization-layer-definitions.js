import { enumerate, makeUPlusStringFromCodePoint } from "/core/utils.js";

export const visualizationLayerDefinitions = [];

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
  identifier: "fontra.empty.selected.glyph",
  name: "Empty selected glyph",
  selectionMode: "selected",
  selectionFilter: (positionedGlyph) => positionedGlyph.isEmpty,
  zIndex: 500,
  colors: { fillColor: "#D8D8D8" /* Must be six hex digits */ },
  colorsDarkMode: { fillColor: "#585858" /* Must be six hex digits */ },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    _drawEmptyGlyphLayer(context, positionedGlyph, parameters, model, controller);
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.empty.hovered.glyph",
  name: "Empty hovered glyph",
  selectionMode: "hovered",
  selectionFilter: (positionedGlyph) => positionedGlyph.isEmpty,
  zIndex: 500,
  colors: { fillColor: "#E8E8E8" /* Must be six hex digits */ },
  colorsDarkMode: { fillColor: "#484848" /* Must be six hex digits */ },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    _drawEmptyGlyphLayer(context, positionedGlyph, parameters, model, controller);
  },
});

function _drawEmptyGlyphLayer(context, positionedGlyph, parameters, model, controller) {
  const box = positionedGlyph.unpositionedBounds;
  const fillColor = parameters.fillColor;
  if (fillColor[0] === "#" && fillColor.length === 7) {
    const gradient = context.createLinearGradient(0, box.yMin, 0, box.yMax);
    gradient.addColorStop(0.0, fillColor + "00");
    gradient.addColorStop(0.2, fillColor + "DD");
    gradient.addColorStop(0.5, fillColor + "FF");
    gradient.addColorStop(0.8, fillColor + "DD");
    gradient.addColorStop(1.0, fillColor + "00");
    context.fillStyle = gradient;
  } else {
    context.fillStyle = fillColor;
  }
  context.fillRect(box.xMin, box.yMin, box.xMax - box.xMin, box.yMax - box.yMin);
}

registerVisualizationLayerDefinition({
  identifier: "fontra.context.glyphs",
  name: "Context glyphs",
  selectionMode: "unselected",
  zIndex: 500,
  colors: { fillColor: "#000" },
  colorsDarkMode: { fillColor: "#FFF" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    context.fillStyle = parameters.fillColor;
    context.fill(positionedGlyph.glyph.flattenedPath2d);
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.cjk.design.frame",
  name: "CJK Design Frame glyphs",
  selectionMode: "editing",
  zIndex: 500,
  colors: {
    strokeColor: "#0004",
    overshootColor: "#00BFFF26",
    secondLineColor: "#A6296344",
  },
  colorsDarkMode: {
    strokeColor: "#FFF6",
    secondLineColor: "#A62963AA",
  },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const cjkDesignFrameParameters =
      model.fontController.fontLib["CJKDesignFrameSettings"];
    if (!cjkDesignFrameParameters) {
      return;
    }
    const [emW, emH] = cjkDesignFrameParameters["em_Dimension"];
    const characterFace = cjkDesignFrameParameters["characterFace"] / 100;
    const [shiftX, shiftY] = cjkDesignFrameParameters["shift"] || [0, -120];
    const [overshootInside, overshootOutside] = cjkDesignFrameParameters["overshoot"];
    const [faceW, faceH] = [emW * characterFace, emH * characterFace];
    const [faceX, faceY] = [(emW - faceW) / 2, (emH - faceH) / 2];
    let horizontalLine = cjkDesignFrameParameters["horizontalLine"];
    let verticalLine = cjkDesignFrameParameters["verticalLine"];
    const [overshootInsideW, overshootInsideH] = [
      faceW - overshootInside * 2,
      faceH - overshootInside * 2,
    ];
    const [overshootOutsideW, overshootOutsideH] = [
      faceW + overshootOutside * 2,
      faceH + overshootOutside * 2,
    ];

    context.translate(shiftX, shiftY);

    context.strokeStyle = parameters.strokeColor;
    context.lineWidth = parameters.cjkFrameLineWidth;
    context.strokeRect(0, 0, emW, emH);
    context.strokeRect(faceX, faceY, faceW, faceH);

    context.strokeStyle = parameters.secondLineColor;
    if (cjkDesignFrameParameters["type"] === "han") {
      horizontalLine /= 100;
      verticalLine /= 100;
      const centerX = emW / 2;
      const centerY = emH / 2;
      for (const y of [
        centerY + emH * horizontalLine,
        centerY - emH * horizontalLine,
      ]) {
        strokeLine(context, 0, y, emW, y);
      }
      for (const x of [centerX + emW * verticalLine, centerX - emW * verticalLine]) {
        strokeLine(context, x, 0, x, emH);
      }
    } else {
      // hangul
      const stepX = faceW / verticalLine;
      const stepY = faceH / horizontalLine;
      for (let i = 1; i < horizontalLine; i++) {
        const y = faceY + i * stepY;
        strokeLine(context, faceX, y, faceX + faceW, y);
      }
      for (let i = 1; i < verticalLine; i++) {
        const x = faceX + i * stepX;
        strokeLine(context, x, faceY, x, faceY + faceH);
      }
    }

    // overshoot rect
    context.fillStyle = parameters.overshootColor;
    context.beginPath();
    context.rect(
      faceX - overshootOutside,
      faceY - overshootOutside,
      overshootOutsideW,
      overshootOutsideH
    );
    context.rect(
      faceX + overshootInside,
      faceY + overshootInside,
      overshootInsideW,
      overshootInsideH
    );
    context.fill("evenodd");
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.undefined.glyph",
  name: "Undefined glyph",
  selectionMode: "all",
  selectionFilter: (positionedGlyph) => positionedGlyph.isUndefined,
  zIndex: 500,
  colors: {
    fillColor: "#0006",
  },
  colorsDarkMode: {
    fillColor: "#FFF6",
  },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    context.fillStyle = parameters.fillColor;
    context.textAlign = "center";
    const lineDistance = 1.2;

    const glyphNameFontSize = 0.1 * positionedGlyph.glyph.xAdvance;
    const placeholderFontSize = 0.75 * positionedGlyph.glyph.xAdvance;
    context.font = `${glyphNameFontSize}px fontra-ui-regular, sans-serif`;
    context.scale(1, -1);
    context.fillText(positionedGlyph.glyphName, positionedGlyph.glyph.xAdvance / 2, 0);
    if (positionedGlyph.character) {
      const uniStr = makeUPlusStringFromCodePoint(
        positionedGlyph.character.codePointAt(0)
      );
      context.fillText(
        uniStr,
        positionedGlyph.glyph.xAdvance / 2,
        -lineDistance * glyphNameFontSize
      );
      context.font = `${placeholderFontSize}px fontra-ui-regular, sans-serif`;
      context.fillText(
        positionedGlyph.character,
        positionedGlyph.glyph.xAdvance / 2,
        -lineDistance * glyphNameFontSize - 0.4 * placeholderFontSize
      );
    }
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.baseline",
  name: "Baseline",
  selectionMode: "editing",
  userSwitchable: true,
  zIndex: 500,
  screenParameters: { strokeWidth: 1 },
  colors: { strokeColor: "#0004" },
  colorsDarkMode: { strokeColor: "#FFF6" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    context.strokeStyle = parameters.strokeColor;
    context.lineWidth = parameters.strokeWidth;
    strokeLine(context, 0, 0, positionedGlyph.glyph.xAdvance, 0);
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.sidebearings",
  name: "Sidebearings",
  selectionMode: "editing",
  zIndex: 500,
  screenParameters: { strokeWidth: 1, extent: 16 },
  colors: { strokeColor: "#0004" },
  colorsDarkMode: { strokeColor: "#FFF6" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    const glyph = positionedGlyph.glyph;
    context.strokeStyle = parameters.strokeColor;
    context.lineWidth = parameters.strokeWidth;
    const extent = parameters.extent;
    strokeLine(context, 0, -extent, 0, extent);
    strokeLine(context, glyph.xAdvance, -extent, glyph.xAdvance, extent);
    if (extent < glyph.xAdvance / 2) {
      strokeLine(context, 0, 0, extent, 0);
      strokeLine(context, glyph.xAdvance, 0, glyph.xAdvance - extent, 0);
    } else {
      strokeLine(context, 0, 0, glyph.xAdvance, 0);
    }
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.ghostpath",
  name: "Ghost path while dragging",
  selectionMode: "editing",
  zIndex: 500,
  screenParameters: { strokeWidth: 1 },
  colors: { strokeColor: "#0002" },
  colorsDarkMode: { strokeColor: "#FFF4" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    if (!model.ghostPath) {
      return;
    }
    context.lineJoin = "round";
    context.strokeStyle = parameters.strokeColor;
    context.lineWidth = parameters.strokeWidth;
    context.stroke(model.ghostPath);
  },
});

registerVisualizationLayerDefinition({
  identifier: "fontra.edit.path.fill",
  name: "Edit path fill",
  selectionMode: "editing",
  zIndex: 500,
  screenParameters: { strokeWidth: 1 },
  colors: { fillColor: "#0001" },
  colorsDarkMode: { fillColor: "#FFF3" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    context.fillStyle = parameters.fillColor;
    context.fill(positionedGlyph.glyph.closedContoursPath2d);
  },
});

//
// allGlyphsCleanVisualizationLayerDefinition is not registered, but used
// separately for the "clean" display.
//
export const allGlyphsCleanVisualizationLayerDefinition = {
  identifier: "fontra.all.glyphs",
  name: "All glyphs",
  selectionMode: "all",
  zIndex: 500,
  colors: { fillColor: "#000" },
  colorsDarkMode: { fillColor: "#FFF" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    context.fillStyle = parameters.fillColor;
    context.fill(positionedGlyph.glyph.flattenedPath2d);
  },
};

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
//   selectionMode: "unselected",  // choice from all, unselected, hovered, selected, editing
//   selectionFilter: (positionedGlyph) => ...some condition...,  // OPTIONAL
//   zIndex: 50
//   screenParameters: {},  // in screen/pixel units
//   glyphParameters: {},  // in glyph units
//   colors: {},
//   colorsDarkMode: {},
//   draw: (context, positionedGlyph, parameters, model, controller) => { /* ... */ },
// }
