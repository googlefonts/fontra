import Panel from "./panel.js";
import * as html from "/core/html-utils.js";
import { getCharFromCodePoint, throttleCalls } from "/core/utils.js";
import { GlyphCell } from "/web-components/glyph-cell.js";
import { Accordion } from "/web-components/ui-accordion.js";

export default class RelatedGlyphPanel extends Panel {
  identifier = "related-glyphs";
  iconPath = "/tabler-icons/binary-tree-2.svg";

  static styles = `
    .sidebar-glyph-relationships {
      box-sizing: border-box;
      height: 100%;
      width: 100%;
    }

    #related-glyphs-header {
      padding: 1em 1em 0 1em;
    }
  `;

  constructor(editorController) {
    super(editorController);
    this.throttledUpdate = throttleCalls((senderID) => this.update(senderID), 100);
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;

    this.setupGlyphRelationshipsElement();

    this.sceneController.sceneSettingsController.addKeyListener(
      ["selectedGlyphName"],
      (event) => this.throttledUpdate()
    );
  }

  getContentElement() {
    this.accordion = new Accordion();

    this.accordion.items = [
      {
        id: "glyph-name-extension-accordion-item",
        label: "Related glyphs via glyph name extension",
        open: true,
        content: html.div({ id: "glyph-name-extension", style: "height: 100%;" }, []),
        getRelatedGlyphsFunc: getRelatedGlyphsByExtension,
      },
    ];

    return html.div(
      {
        class: "sidebar-glyph-relationships",
      },
      [html.div({ id: "related-glyphs-header" }, ["Related Glyphs"]), this.accordion]
    );
  }

  setupGlyphRelationshipsElement() {
    this.relatedGlyphsHeaderElement = this.contentElement.querySelector(
      "#related-glyphs-header"
    );
  }

  async update() {
    const varGlyphController =
      await this.sceneController.sceneModel.getSelectedVariableGlyphController();
    const varGlyph = varGlyphController?.glyph;

    const glyphName = varGlyph?.name;

    const codePoints = glyphName ? this.fontController.glyphMap[glyphName] : [];
    const character = getCharFromCodePoint(codePoints[0]);
    const s =
      character && character != glyphName ? `“${character}”, ${glyphName}` : glyphName;

    this.relatedGlyphsHeaderElement.innerHTML = glyphName
      ? `<b>Related glyphs for ${s}</b>`
      : `<b>Related glyphs</b> (no glyph selected)`;

    for (const item of this.accordion.items) {
      this._updateAccordionItem(item, glyphName); // No await
    }

    this.accordion.hidden = !glyphName;
  }

  async _updateAccordionItem(item, glyphName) {
    const element = item.content;
    element.innerHTML = "";
    if (glyphName) {
      const relatedGlyphNames = await item.getRelatedGlyphsFunc(
        this.fontController,
        glyphName
      );
      if (relatedGlyphNames?.length) {
        for (const glyphName of relatedGlyphNames) {
          element.appendChild(
            new GlyphCell(
              this.fontController,
              glyphName,
              this.sceneController.sceneSettings,
              "fontLocationSourceMapped"
            )
          );
        }
      } else {
        element.innerText = "No related glyphs were found";
      }
    }
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
    }
  }
}

function getRelatedGlyphsByExtension(fontController, targetGlyphName) {
  const targetBaseGlyphName = targetGlyphName.split(".")[0];
  return Object.keys(fontController.glyphMap)
    .filter((glyphName) => {
      const baseGlyphName = glyphName.split(".")[0];
      return baseGlyphName == targetBaseGlyphName && glyphName != targetGlyphName;
    })
    .sort();
}

customElements.define("panel-related-glyph", RelatedGlyphPanel);
