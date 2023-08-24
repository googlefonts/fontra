import * as html from "/core/unlit.js";
import { css } from "../third-party/lit.js";
import Panel from "./panel.js";

import { registerVisualizationLayerDefinition } from "./visualization-layer-definitions.js";

let referenceFontModel;

registerVisualizationLayerDefinition({
  identifier: "fontra.reference.font",
  name: "Reference font",
  selectionMode: "editing",
  userSwitchable: true,
  defaultOn: true,
  zIndex: 100,
  screenParameters: { strokeWidth: 1 },
  colors: { fillColor: "#AAA6" },
  // colorsDarkMode: { strokeColor: "red" },
  draw: (context, positionedGlyph, parameters, model, controller) => {
    if (!referenceFontModel?.referenceFontName) {
      return;
    }
    let text = referenceFontModel?.charOverride || positionedGlyph.character;
    if (!text && positionedGlyph.glyphName.includes(".")) {
      const baseGlyphName = positionedGlyph.glyphName.split(".")[0];
      const codePoint = (editorController.fontController.glyphMap[baseGlyphName] ||
        [])[0];
      if (codePoint) {
        text = String.fromCodePoint(codePoint);
      }
    }
    if (!text) {
      return;
    }
    context.lineWidth = parameters.strokeWidth;
    context.font = `${model.fontController.unitsPerEm}px ${referenceFontModel.referenceFontName}, AdobeBlank`;
    context.scale(1, -1);
    if (parameters.fillColor) {
      context.fillStyle = parameters.fillColor;
      context.fillText(text, 0, 0);
    }
    if (parameters.strokeColor) {
      context.strokeStyle = parameters.strokeColor;
      context.strokeText(text, 0, 0);
    }
  },
});

export default class ReferenceFontPanel extends Panel {
  identifier = "reference-font";
  iconPath = "/images/reference.svg";

  static styles = css`
    .sidebar-reference-font {
      width: 100%;
      height: 100%;
      display: flex;
    }
  `;

  getContentElement() {
    return html.div(
      {
        class: "sidebar-reference-font",
      },
      [
        html.createDomElement("reference-font", {
          id: "reference-font",
        }),
      ]
    );
  }

  attach() {
    const referenceFontElement = this.contentElement.querySelector("#reference-font");
    referenceFontElement.controller.addKeyListener("referenceFontName", (event) => {
      if (event.newValue) {
        this.editorController.visualizationLayersSettings.model[
          "fontra.reference.font"
        ] = true;
      }
      this.editorController.canvasController.requestUpdate();
    });
    referenceFontElement.controller.addKeyListener("charOverride", (event) => {
      this.editorController.canvasController.requestUpdate();
    });

    referenceFontElement.controller.addKeyListener("languageCode", (event) => {
      this.editorController.canvasController.setLangAttribute(
        referenceFontElement.controller.model.languageCode
      );
    });

    this.editorController.canvasController.setLangAttribute(
      referenceFontElement.controller.model.languageCode
    );

    referenceFontModel = referenceFontElement.model;
  }
}

customElements.define("panel-reference-font", ReferenceFontPanel);
