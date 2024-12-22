import { themeColorCSS } from "./theme-support.js";
import * as html from "/core/html-utils.js";
import { SimpleElement } from "/core/html-utils.js";
import { translate } from "/core/localization.js";

const colors = {
  "search-input-foreground-color": ["black", "white"],
  "search-input-background-color": ["#eee", "#333"],
};

export class GlyphsSearchField extends SimpleElement {
  static styles = `
    ${themeColorCSS(colors)}

    input {
      color: var(--search-input-foreground-color);
      background-color: var(--search-input-background-color);
      font-family: fontra-ui-regular, sans-serif;
      font-size: 1.1rem;
      border-radius: 2em;
      border: none;
      outline: none;
      resize: none;
      width: 100%;
      height: 1.8em;
      box-sizing: border-box;
      padding: 0.2em 0.8em;
    }
  `;

  constructor(glyphsListItemsController, controllerKey) {
    super();
    this.glyphsListItemsController = glyphsListItemsController;
    this.controllerKey = controllerKey;
    this.searchField = html.input({
      type: "text",
      placeholder: translate("sidebar.glyphs.search"),
      autocomplete: "off",
      oninput: (event) => this._searchFieldChanged(event),
    });

    this._glyphNamesListFilterFunc = (item) => true; // pass all through

    this.glyphMap = {};

    this.shadowRoot.appendChild(this.searchField);
  }

  focusSearchField() {
    this.searchField.focus();
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
    this.glyphsListItems = [];
    for (const glyphName in glyphMap) {
      this.glyphsListItems.push({
        glyphName: glyphName,
        unicodes: glyphMap[glyphName],
      });
    }
    this.glyphsListItems.sort(glyphItemSortFunc);
    this._setFilteredGlyphNamesListContent();
  }

  _searchFieldChanged(event) {
    const value = event.target.value;
    const searchItems = value.split(/\s+/).filter((item) => item.length);
    const hexSearchItems = searchItems
      .filter((item) => [...item].length === 1) // num chars, not utf16 units!
      .map((item) => item.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"));
    searchItems.push(...hexSearchItems);
    this._glyphNamesListFilterFunc = (item) => glyphFilterFunc(item, searchItems);
    this._setFilteredGlyphNamesListContent();
  }

  _setFilteredGlyphNamesListContent() {
    const filteredGlyphItems = this.glyphsListItems.filter(
      this._glyphNamesListFilterFunc
    );
    this.glyphsListItemsController.model[this.controllerKey] = filteredGlyphItems;
  }
}

customElements.define("glyphs-search-field", GlyphsSearchField);

function glyphItemSortFunc(item1, item2) {
  const uniCmp = compare(item1.unicodes[0], item2.unicodes[0]);
  const glyphNameCmp = compare(item1.glyphName, item2.glyphName);
  return uniCmp ? uniCmp : glyphNameCmp;
}

function glyphFilterFunc(item, searchItems) {
  if (!searchItems.length) {
    return true;
  }
  for (const searchString of searchItems) {
    if (item.glyphName.indexOf(searchString) >= 0) {
      return true;
    }
    if (item.unicodes[0] !== undefined) {
      const char = String.fromCodePoint(item.unicodes[0]);
      if (searchString === char) {
        return true;
      }
    }
  }
  return false;
}

function compare(a, b) {
  // sort undefined at the end
  if (a === b) {
    return 0;
  } else if (a === undefined) {
    return 1;
  } else if (b === undefined) {
    return -1;
  } else if (a < b) {
    return -1;
  } else {
    return 1;
  }
}
