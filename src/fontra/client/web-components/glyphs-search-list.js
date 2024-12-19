import { GlyphsSearchField } from "./glyphs-search-field.js";
import { UIList } from "./ui-list.js";
import * as html from "/core/html-utils.js";
import { UnlitElement } from "/core/html-utils.js";
import { ObservableController } from "/core/observable-object.js";
import {
  getCharFromCodePoint,
  guessCharFromGlyphName,
  makeUPlusStringFromCodePoint,
  throttleCalls,
} from "/core/utils.js";

export class GlyphsSearchList extends UnlitElement {
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
    this.glyphsListItemsController = new ObservableController({
      glyphsListItems: [],
    });

    this.searchField = new GlyphsSearchField(
      this.glyphsListItemsController,
      "glyphsListItems"
    );
    this.glyphNamesList = this.makeGlyphNamesList();

    this.throttledUpdate = throttleCalls(() => this.update(), 50);

    this.glyphsListItemsController.addKeyListener(
      "glyphsListItems",
      this.throttledUpdate
    );
  }

  makeGlyphNamesList() {
    const columnDescriptions = [
      {
        key: "char",
        title: " ",
        width: "1.8em",
        cellFactory: (item, description) => {
          if (item.unicodes[0]) {
            return getCharFromCodePoint(item.unicodes[0]);
          }
          const guessedChar = guessCharFromGlyphName(item.glyphName);
          return guessedChar ? html.span({ class: "guessed-char" }, [guessedChar]) : "";
        },
      },
      { key: "glyphName", title: "glyph name", width: "10em", isIdentifierKey: true },
      {
        key: "unicode",
        width: "fit-content",
        get: (item) => item.unicodes.map(makeUPlusStringFromCodePoint).join(","),
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
    this.searchField.focus();
  }

  async update() {
    this.glyphNamesList.setItems(this.glyphsListItemsController.model.glyphsListItems);
  }

  async render() {
    return [this.searchField, this.glyphNamesList];
  }

  get glyphMap() {
    return this.searchField._glyphMap;
  }

  set glyphMap(glyphMap) {
    this.searchField.glyphMap = glyphMap;
  }

  getSelectedGlyphName() {
    return this.glyphNamesList.items[this.glyphNamesList.selectedItemIndex]?.glyphName;
  }

  getFilteredGlyphNames() {
    return this.glyphNamesList.items.map((item) => item.glyphName);
  }
}

customElements.define("glyphs-search-list", GlyphsSearchList);
