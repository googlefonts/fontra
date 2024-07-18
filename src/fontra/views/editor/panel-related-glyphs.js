import Panel from "./panel.js";
import * as html from "/core/html-utils.js";
import {
  getSuggestedGlyphName,
  unicodeDecompose,
  unicodeUsedBy,
} from "/core/server-utils.js";
import { getCharFromCodePoint, throttleCalls } from "/core/utils.js";
import { GlyphCell } from "/web-components/glyph-cell.js";
import { showMenu } from "/web-components/menu-panel.js";
import { Accordion } from "/web-components/ui-accordion.js";

export default class RelatedGlyphPanel extends Panel {
  identifier = "related-glyphs";
  iconPath = "/tabler-icons/binary-tree-2.svg";

  static styles = `
    .sidebar-glyph-relationships {
      box-sizing: border-box;
      height: calc(100% - 2em); // Would be nice to do without the calc
      width: 100%;
    }

    #related-glyphs-header {
      padding: 1em 1em 0 1em;
      text-wrap: wrap;
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

    this.fontController.addChangeListener({ glyphMap: null }, (event) =>
      this.throttledUpdate()
    );
  }

  getContentElement() {
    this.accordion = new Accordion();

    this.accordion.appendStyle(`
    .no-glyphs-found-label {
      font-size: 0.9em;
      opacity: 40%;
    }

    .related-glyphs-accordion-item {
      height: 100%;
      width: 100%;
      overflow-y: scroll;
      white-space: normal;
    }
    `);

    this.accordion.items = [
      {
        label: "Alternate glyphs",
        open: true,
        content: html.div({ class: "related-glyphs-accordion-item" }, []),
        getRelatedGlyphsFunc: getRelatedGlyphsByExtension,
        noGlyphsString: "No alternate glyphs were found",
      },
      {
        label: "Components used by this glyph",
        open: true,
        content: html.div({ class: "related-glyphs-accordion-item" }, []),
        getRelatedGlyphsFunc: getComponentGlyphs,
        noGlyphsString: "No component glyphs were found",
      },
      {
        label: "Glyphs using this glyph as a component",
        open: true,
        content: html.div({ class: "related-glyphs-accordion-item" }, []),
        getRelatedGlyphsFunc: getUsedByGlyphs,
        noGlyphsString: "No glyphs were found that use this glyph",
      },
      {
        label: "Character decomposition",
        open: true,
        content: html.div({ class: "related-glyphs-accordion-item" }, []),
        getRelatedGlyphsFunc: getUnicodeDecomposed,
        noGlyphsString: "No decomposition information was found",
      },
      {
        label: "Characters that decompose using this character",
        open: true,
        content: html.div({ class: "related-glyphs-accordion-item" }, []),
        getRelatedGlyphsFunc: getUnicodeUsedBy,
        noGlyphsString: "No characters were found that use this character",
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
    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;

    const varGlyphController =
      await this.sceneController.sceneModel.getSelectedVariableGlyphController();
    const varGlyph = varGlyphController?.glyph;

    const codePoints = glyphName ? this.fontController.glyphMap[glyphName] || [] : [];
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
      const relatedGlyphs = await item.getRelatedGlyphsFunc(
        this.fontController,
        glyphName
      );
      if (relatedGlyphs?.length) {
        for (const { glyphName, codePoints } of relatedGlyphs) {
          const glyphCell = new GlyphCell(
            this.fontController,
            glyphName,
            codePoints,
            this.sceneController.sceneSettingsController,
            "fontLocationSourceMapped"
          );
          glyphCell.ondblclick = (event) => this.handleDoubleClick(event, glyphCell);
          glyphCell.addEventListener("contextmenu", (event) =>
            this.handleContextMenu(event, glyphCell, item)
          );

          element.appendChild(glyphCell);
        }
      } else {
        element.appendChild(
          html.span({ class: "no-glyphs-found-label" }, [item.noGlyphsString])
        );
      }
    }
  }

  handleDoubleClick(event, glyphCell) {
    this.insertGlyphIntoTextString(glyphCell, event.altKey ? 1 : 0, !event.altKey);
  }

  insertGlyphIntoTextString(glyphCell, where, select) {
    const glyphInfos = [
      {
        glyphName: glyphCell.glyphName,
        character: getCharFromCodePoint(glyphCell.codePoints[0]),
      },
    ];
    this.editorController.insertGlyphInfos(glyphInfos, where, select);
  }

  handleContextMenu(event, glyphCell, item) {
    event.preventDefault();

    const items = [
      {
        title: "Replace selected glyph",
        callback: () => {
          this.insertGlyphIntoTextString(glyphCell, 0, true);
        },
      },
      {
        title: "Insert after selected glyph",
        callback: () => {
          this.insertGlyphIntoTextString(glyphCell, 1, false);
        },
      },
      {
        title: "Insert after selected glyph and select",
        callback: () => {
          this.insertGlyphIntoTextString(glyphCell, 1, true);
        },
      },
      {
        title: "Insert before selected glyph",
        callback: () => {
          this.insertGlyphIntoTextString(glyphCell, -1, false);
        },
      },
      {
        title: "Insert before selected glyph and select",
        callback: () => {
          this.insertGlyphIntoTextString(glyphCell, -1, true);
        },
      },
    ];
    const { x, y } = event;
    showMenu(items, { x: x + 1, y: y - 1 }, document.documentElement);
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
    }
  }
}

function getRelatedGlyphsByExtension(fontController, targetGlyphName) {
  const targetBaseGlyphName = targetGlyphName.split(".")[0];
  const glyphNames = Object.keys(fontController.glyphMap)
    .filter((glyphName) => {
      const baseGlyphName = glyphName.split(".")[0];
      return baseGlyphName == targetBaseGlyphName && glyphName != targetGlyphName;
    })
    .sort();
  return addCharInfo(fontController, glyphNames);
}

async function getComponentGlyphs(fontController, targetGlyphName) {
  const varGlyph = await fontController.getGlyph(targetGlyphName);
  const componentNames = [...(varGlyph?.getAllComponentNames() || [])];
  componentNames.sort();

  return addCharInfo(fontController, componentNames);
}

async function getUsedByGlyphs(fontController, targetGlyphName) {
  const glyphNames = await fontController.findGlyphsThatUseGlyph(targetGlyphName);
  return addCharInfo(fontController, glyphNames);
}

async function getUnicodeDecomposed(fontController, targetGlyphName) {
  return await _getRelatedUnicode(fontController, targetGlyphName, unicodeDecompose);
}

async function getUnicodeUsedBy(fontController, targetGlyphName) {
  return await _getRelatedUnicode(fontController, targetGlyphName, unicodeUsedBy);
}

async function _getRelatedUnicode(fontController, targetGlyphName, uniFunc) {
  const codePoint = fontController.codePointForGlyph(targetGlyphName);
  if (!codePoint) {
    return [];
  }
  const usedByCodePoints = await uniFunc(codePoint);
  const glyphInfo = [];
  for (const codePoint of usedByCodePoints) {
    const glyphName =
      fontController.characterMap[codePoint] ||
      (await getSuggestedGlyphName(codePoint));
    glyphInfo.push({ glyphName, codePoints: [codePoint] });
  }
  return glyphInfo;
}

function addCharInfo(fontController, glyphNames) {
  const glyphMap = fontController.glyphMap;
  return glyphNames.map((glyphName) => {
    return { glyphName, codePoints: glyphMap[glyphName] || [] };
  });
}

customElements.define("panel-related-glyph", RelatedGlyphPanel);
