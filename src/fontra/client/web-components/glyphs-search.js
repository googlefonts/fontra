import { UIList } from "/web-components/ui-list.js";
import {
  getCharFromUnicode,
  htmlToElement,
  makeUPlusStringFromCodePoint,
} from "/core/utils.js";

const searchElementHTML = `
<input
  type="text"
  class="glyphs-search-input"
  id="glyphs-search-input"
  placeholder="Search glyphs"
  autocomplete="off"
/>`;

const glyphsSearchCSS = `
display: grid;
gap: 1em;
grid-template-rows: auto 1fr;
box-sizing: border-box;
overflow: hidden;
align-content: start;
`;

export class GlyphsSearch extends HTMLElement {
  constructor() {
    super();
    const searchField = htmlToElement(searchElementHTML);
    searchField.oninput = (event) => this._searchFieldChanged(event);

    const columnDescriptions = [
      {
        key: "char",
        width: "2em",
        get: (item) => getCharFromUnicode(item.unicodes[0]),
      },
      { key: "glyphName", width: "10em" },
      {
        key: "unicode",
        width: "5em",
        get: (item) => makeUPlusStringFromCodePoint(item.unicodes[0]),
      },
    ];
    this.glyphNamesList = new UIList();
    this.glyphNamesList.columnDescriptions = columnDescriptions;
    this.glyphNamesList.itemEqualFunc = (itemA, itemB) =>
      itemA.glyphName === itemB.glyphName;

    this.glyphNamesList.addEventListener("listSelectionChanged", () => {
      const event = new CustomEvent("selectedGlyphNameChanged", {
        bubbles: false,
        detail: this.getSelectedGlyphName(),
      });
      this.dispatchEvent(event);
    });

    this._glyphNamesListFilterFunc = (item) => true; // pass all through

    this.glyphMap = {};

    this.style = glyphsSearchCSS;
    this.appendChild(searchField);
    this.appendChild(this.glyphNamesList);
  }

  get glyphMap() {
    return this._glyphMap;
  }

  set glyphMap(glyphMap) {
    this._glyphMap = glyphMap;
    this.updateGlyphNamesListContent();
  }

  getSelectedGlyphName() {
    return this.glyphNamesList.items[this.glyphNamesList.selectedItemIndex]?.glyphName;
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
    this._glyphNamesListFilterFunc = (item) => glyphFilterFunc(item, searchItems);
    this._setFilteredGlyphNamesListContent();
  }

  _setFilteredGlyphNamesListContent() {
    const filteredGlyphItems = this.glyphsListItems.filter(
      this._glyphNamesListFilterFunc
    );
    const selectedItem = this.glyphNamesList.getSelectedItem();
    this.glyphNamesList.setItems(filteredGlyphItems);
    this.glyphNamesList.setSelectedItem(selectedItem);
  }
}

customElements.define("glyphs-search", GlyphsSearch);

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
