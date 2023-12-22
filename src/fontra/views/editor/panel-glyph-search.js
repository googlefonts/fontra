import Panel from "./panel.js";
import * as html from "/core/html-utils.js";
import { getCharFromUnicode } from "/core/utils.js";

export default class GlyphSearchPanel extends Panel {
  identifier = "glyph-search";
  iconPath = "/images/magnifyingglass.svg";

  static styles = `
    .glyph-search {
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      display: grid;
      gap: 1em;
      padding: 1em;
    }
  `;

  constructor(editorController) {
    super(editorController);
    const glyphsSearch = this.contentElement.querySelector("#glyphs-search");
    glyphsSearch.addEventListener("selectedGlyphNameChanged", (event) =>
      this.glyphNameChangedCallback(event.detail)
    );
    this.editorController.fontController.addChangeListener({ glyphMap: null }, () => {
      glyphsSearch.updateGlyphNamesListContent();
    });
    this.editorController.fontController.ensureInitialized.then(() => {
      glyphsSearch.glyphMap = this.editorController.fontController.glyphMap;
    });
  }

  glyphNameChangedCallback(glyphName) {
    if (!glyphName) {
      return;
    }
    const glyphInfo = this.glyphInfoFromGlyphName(
      glyphName,
      this.editorController.fontController
    );
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

  async toggle(on, focus) {
    if (on && focus) {
      const glyphsSearch = this.contentElement.querySelector("#glyphs-search");
      glyphsSearch.focusSearchField();
    }
  }

  glyphInfoFromGlyphName(glyphName, fontController) {
    const glyphInfo = { glyphName: glyphName };
    const codePoint = fontController.codePointForGlyph(glyphName);
    if (codePoint !== undefined) {
      glyphInfo["character"] = getCharFromUnicode(codePoint);
    }
    return glyphInfo;
  }
}

customElements.define("panel-glyph-search", GlyphSearchPanel);
