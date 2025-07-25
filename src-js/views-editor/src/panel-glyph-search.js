import * as html from "@fontra/core/html-utils.js";
import "@fontra/web-components/glyph-search-list.js";
import Panel from "./panel.js";

export default class GlyphSearchPanel extends Panel {
  identifier = "glyph-search";
  iconPath = "/images/magnifyingglass.svg";

  static styles = `
    .glyph-search-section {
      height: 100%;
      display: flex;
      flex-direction: column;
    }
  `;

  constructor(editorController) {
    super(editorController);
    this.glyphSearch = this.contentElement.querySelector("#glyph-search-list");
    this.glyphSearch.addEventListener("selectedGlyphNameChanged", (event) =>
      this.glyphNameChangedCallback(event.detail, false)
    );
    this.glyphSearch.addEventListener("selectedGlyphNameDoubleClicked", (event) =>
      this.glyphNameChangedCallback(event.detail, true)
    );
    this.editorController.fontController.addChangeListener({ glyphMap: null }, () => {
      this.glyphSearch.updateGlyphNamesListContent();
    });
    this.editorController.fontController.ensureInitialized.then(() => {
      this.glyphSearch.glyphMap = this.editorController.fontController.glyphMap;
    });

    this.editorController.sceneSettingsController.addKeyListener(
      ["selectedGlyphName", "substituteGlyphName"],
      (event) => {
        if (
          event.newValue &&
          event.newValue !== this.glyphSearch.getSelectedGlyphName()
        ) {
          this.glyphSearch.setSelectedGlyphName(event.newValue);
        }
      }
    );
  }

  glyphNameChangedCallback(glyphName, isDoubleClick) {
    if (!glyphName) {
      return;
    }

    const glyphInfo =
      this.editorController.fontController.glyphInfoFromGlyphName(glyphName);

    let selectedGlyphState = this.editorController.sceneSettings.selectedGlyph;
    const glyphLines = [...this.editorController.sceneSettings.glyphLines];

    if (selectedGlyphState && !isDoubleClick) {
      if (
        !glyphLines[selectedGlyphState.lineIndex][selectedGlyphState.glyphIndex]
          .isPlaceholder
      ) {
        glyphLines[selectedGlyphState.lineIndex][selectedGlyphState.glyphIndex] =
          glyphInfo;
        this.editorController.sceneSettings.glyphLines = glyphLines;
      }
    } else if (!selectedGlyphState && isDoubleClick) {
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
    this.editorController.sceneSettings.substituteGlyphName = glyphName;
  }

  getContentElement() {
    return html.div(
      {
        class: "panel",
      },
      [
        html.div(
          {
            class: "panel-section panel-section--flex glyph-search-section",
          },
          [
            html.createDomElement("glyph-search-list", {
              id: "glyph-search-list",
            }),
          ]
        ),
      ]
    );
  }

  async toggle(on, focus) {
    if (on && focus) {
      this.glyphSearch.focusSearchField();
    }
  }
}

customElements.define("panel-glyph-search", GlyphSearchPanel);
