import * as html from "/core/unlit.js";
import { css } from "../third-party/lit.js";
import Panel from "./panel.js";

import { getCharFromUnicode } from "../core/utils.js";

export default class GlyphSearchPanel extends Panel {
  identifier = "glyph-search";
  iconPath = "/images/magnifyingglass.svg";

  static styles = css`
    .glyph-search {
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      display: grid;
      gap: 1em;
      padding: 1em;
    }
  `;

  setup() {
    this.editorController.glyphsSearch =
      this.contentElement.querySelector("#glyphs-search");
    this.editorController.glyphsSearch.glyphMap =
      this.editorController.fontController.glyphMap;
    this.editorController.glyphsSearch.addEventListener(
      "selectedGlyphNameChanged",
      (event) => {
        if (!event.detail) {
          return;
        }
        const codePoint = this.editorController.fontController.codePointForGlyph(
          event.detail
        );
        const glyphInfo = { glyphName: event.detail };
        if (codePoint !== undefined) {
          glyphInfo["character"] = getCharFromUnicode(codePoint);
        }
        let selectedGlyphState = this.editorController.sceneSettings.selectedGlyph;
        const glyphLines = [...this.editorController.sceneSettings.glyphLines];
        if (selectedGlyphState) {
          glyphLines[selectedGlyphState.lineIndex][selectedGlyphState.glyphIndex] =
            glyphInfo;
          this.editorController.sceneSettings.glyphLines = glyphLines;
        } else {
          if (!glyphLines.length) {
            glyphLines.push([]);
          }
          const lineIndex = glyphLines.length - 1;
          glyphLines[lineIndex].push(glyphInfo);
          this.editorController.sceneSettings.glyphLines = glyphLines;
          selectedGlyphState = {
            lineIndex: lineIndex,
            glyphIndex: glyphLines[lineIndex].length - 1,
            isEditing: false,
          };
        }

        this.editorController.sceneSettings.selectedGlyph = selectedGlyphState;
      }
    );
  }

  getContentElement() {
    return html.div(
      {
        class: "glyph-search",
      },
      [
        html.createDomElement("glyphs-search", {
          id: "glyphs-search",
        }),
      ]
    );
  }
}

customElements.define("panel-glyph-search", GlyphSearchPanel);
