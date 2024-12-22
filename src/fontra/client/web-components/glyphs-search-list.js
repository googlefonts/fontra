import { GlyphsSearchField } from "./glyphs-search-field.js";
import { UIList } from "./ui-list.js";
import * as html from "/core/html-utils.js";
import { SimpleElement } from "/core/html-utils.js";
import {
  getCharFromCodePoint,
  guessCharFromGlyphName,
  makeUPlusStringFromCodePoint,
  throttleCalls,
} from "/core/utils.js";

export class GlyphsSearchList extends SimpleElement {
  static styles = `
    :host {
      display: grid;
      gap: 1em;
      grid-template-rows: auto 1fr;
      box-sizing: border-box;
      overflow: hidden;
      align-content: start;
    }
  `;

  constructor() {
    super();

    this.searchField = new GlyphsSearchField();
    this.glyphNamesList = this._makeGlyphNamesList();

    this.throttledUpdate = throttleCalls(() => this.update(), 50);

    this.searchField.oninput = (event) => this.throttledUpdate();

    this.shadowRoot.appendChild(this.searchField);
    this.shadowRoot.appendChild(this.glyphNamesList);
  }

  _makeGlyphNamesList() {
    const columnDescriptions = [
      {
        key: "char",
        title: " ",
        width: "1.8em",
        cellFactory: (item, description) => {
          if (item.codePoints[0]) {
            return getCharFromCodePoint(item.codePoints[0]);
          }
          const guessedChar = guessCharFromGlyphName(item.glyphName);
          return guessedChar ? html.span({ class: "guessed-char" }, [guessedChar]) : "";
        },
      },
      { key: "glyphName", title: "glyph name", width: "10em", isIdentifierKey: true },
      {
        key: "unicode",
        width: "fit-content",
        get: (item) => item.codePoints.map(makeUPlusStringFromCodePoint).join(","),
      },
    ];
    const glyphNamesList = new UIList();
    glyphNamesList.appendStyle(`
      .guessed-char {
        color: #999;
      }
    `);
    glyphNamesList.columnDescriptions = columnDescriptions;

    glyphNamesList.addEventListener("listSelectionChanged", () => {
      const event = new CustomEvent("selectedGlyphNameChanged", {
        bubbles: false,
        detail: this.getSelectedGlyphName(),
      });
      this.dispatchEvent(event);
    });

    glyphNamesList.addEventListener("rowDoubleClicked", () => {
      const event = new CustomEvent("selectedGlyphNameDoubleClicked", {
        bubbles: false,
        detail: this.getSelectedGlyphName(),
      });
      this.dispatchEvent(event);
    });
    return glyphNamesList;
  }

  focusSearchField() {
    this.searchField.focusSearchField();
  }

  update() {
    this.updateGlyphNamesListContent();
  }

  get glyphMap() {
    return this._glyphMap;
  }

  set glyphMap(glyphMap) {
    this._glyphMap = glyphMap;
    this.updateGlyphNamesListContent();
  }

  updateGlyphNamesListContent() {
    const glyphMap = this.glyphMap;
    const glyphsListItems = [];
    for (const glyphName in glyphMap) {
      glyphsListItems.push({
        glyphName: glyphName,
        codePoints: glyphMap[glyphName],
      });
    }

    this.glyphsListItems = this.searchField.sortGlyphs(glyphsListItems);
    this._setFilteredGlyphNamesListContent();
  }

  _setFilteredGlyphNamesListContent() {
    const filteredGlyphItems = this.searchField.filterGlyphs(this.glyphsListItems);
    this.glyphNamesList.setItems(filteredGlyphItems);
  }

  getSelectedGlyphName() {
    return this.glyphNamesList.items[this.glyphNamesList.selectedItemIndex]?.glyphName;
  }

  getFilteredGlyphNames() {
    return this.glyphNamesList.items.map((item) => item.glyphName);
  }
}

customElements.define("glyphs-search-list", GlyphsSearchList);
