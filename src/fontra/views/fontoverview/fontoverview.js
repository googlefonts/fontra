import { FontController } from "../core/font-controller.js";
import * as html from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import { getRemoteProxy } from "../core/remote.js";
import { mapAxesFromUserSpaceToSourceSpace } from "../core/var-model.js";
import { makeDisplayPath } from "../core/view-utils.js";
import { translate } from "/core/localization.js";
import { GlyphCell } from "/web-components/glyph-cell.js";
import { message } from "/web-components/modal-dialog.js";

// TODOs:
// 1. I am wondering if it would make sense to refactor GlyphsSearch into two web components:
//    1. GlyphsSearchField: Includes the search field, only. Access the list of glyphs with eg. glyphsListItemsController.
//    2. GlyphsSearchList: (contain the GlyphsSearchField) which uses GlyphsSearch and adds the glyph list.
// 3. Do we want to make the sidebar scalable? If so, we may want to refactor sidebar-resize-gutter or at least have a look at it. Follow up task?
// 4. Context menu is not implemented in the overview, yet. We may want to add them. As follow up task. Related to 6. Add top menu bar.
// 5. Maybe use https://www.npmjs.com/package/unicode-properties for overview sections. Also, how to we handle unencoded glyphs? As follow up task!
// 6. Add top menu bar, please see: https://github.com/googlefonts/fontra/issues/1845
// 7. When opening a glyph in the editor via double click, there is an error: It says 'error while interpolating font sources '{message: 'objects have incompatible number of entries: 7 != 6', type: 'interpolation-error'}'. Maybe not relevant for this PR.
// 8. Glyph selection: also multiple glyphs.

// START OF COPY: This is a copy of GlyphsSearch but without the list of glyph names
import { UnlitElement, div, label, option, select } from "/core/html-utils.js";
import {
  dumpURLFragment,
  getCharFromCodePoint,
  guessCharFromGlyphName,
  makeUPlusStringFromCodePoint,
  throttleCalls,
} from "/core/utils.js";
import { themeColorCSS } from "/web-components/theme-support.js";
import { UIList } from "/web-components/ui-list.js";

const colors = {
  "search-input-foreground-color": ["black", "white"],
  "search-input-background-color": ["#eee", "#333"],
};

class GlyphsSearchForOverview extends UnlitElement {
  static styles = `
    ${themeColorCSS(colors)}

    :host {
      display: grid;
      grid-template-rows: auto 1fr;
      box-sizing: border-box;
      overflow: hidden;
      align-content: start;
    }

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

    // I delete a big chunk of code here that is not needed for the overview

    this._glyphNamesListFilterFunc = (item) => true; // pass all through

    this.glyphMap = {};
  }

  focusSearchField() {
    this.searchField.focus();
  }

  render() {
    return this.searchField;
  }

  get glyphMap() {
    return this._glyphMap;
  }

  set glyphMap(glyphMap) {
    this._glyphMap = glyphMap;
    this.updateGlyphNamesListContent();
  }

  // getSelectedGlyphName() {
  //   return this.glyphNamesList.items[this.glyphNamesList.selectedItemIndex]?.glyphName;
  // }

  // getFilteredGlyphNames() {
  //   return this.glyphNamesList.items.map((item) => item.glyphName);
  // }

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

  async _setFilteredGlyphNamesListContent() {
    const filteredGlyphItems = this.glyphsListItems.filter(
      this._glyphNamesListFilterFunc
    );
    //this.glyphNamesList.setItems(filteredGlyphItems);
    this.glyphsListItemsController.model[this.controllerKey] = filteredGlyphItems;
  }
}

customElements.define("glyphs-search-glyph-overview", GlyphsSearchForOverview);

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
// END OF COPY

export class FontOverviewController {
  static async fromWebSocket() {
    const pathItems = window.location.pathname.split("/").slice(3);
    const displayPath = makeDisplayPath(pathItems);
    document.title = `Fontra Font Overview — ${decodeURI(displayPath)}`;
    const projectPath = pathItems.join("/");
    const protocol = window.location.protocol === "http:" ? "ws" : "wss";
    const wsURL = `${protocol}://${window.location.host}/websocket/${projectPath}`;

    const remoteFontEngine = await getRemoteProxy(wsURL);
    const fontOverviewController = new FontOverviewController(remoteFontEngine);
    remoteFontEngine.receiver = fontOverviewController;
    remoteFontEngine.onclose = (event) =>
      fontOverviewController.handleRemoteClose(event);
    remoteFontEngine.onerror = (event) =>
      fontOverviewController.handleRemoteError(event);
    await fontOverviewController.start();
    return fontOverviewController;
  }

  constructor(font) {
    this.fontController = new FontController(font);

    this.locationController = new ObservableController({
      fontLocationSourceMapped: {},
    });

    this.glyphsListItemsController = new ObservableController({
      glyphsListItems: [],
    });

    this.glyphs = this.glyphsListItemsController.model.glyphsListItems;

    this.throttledUpdate = throttleCalls(() => this._updateGlyphOverview(), 50);
  }

  async start() {
    await this.fontController.initialize();
    this.fontSources = await this.fontController.getSources();
    this.fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(
      this.fontController.axes.axes
    );
    this.sortedSourceIdentifiers = this.fontController.getSortedSourceIdentifiers();
    this.currentFontSourceIdentifier = this.sortedSourceIdentifiers[0];
    this.locationController.model.fontLocationSourceMapped = {
      ...this.fontSources[this.currentFontSourceIdentifier]?.location,
    }; // Note: a font may not have font sources therefore the ?-check.

    const sidebarContainer = document.querySelector("#sidebar-container");
    const panelContainer = document.querySelector("#panel-container");

    const sidebarElement = await this._getSidebarForGlyphOverview();
    sidebarContainer.appendChild(sidebarElement);

    const panelElement = html.div(
      {
        class: "font-overview-panel",
        id: "font-overview-panel",
      },
      ["No glyphs found. Font is empty."]
    );
    panelContainer.appendChild(panelElement);

    this.glyphsListItemsController.addKeyListener(
      "glyphsListItems",
      this.throttledUpdate
    );

    // This is the inital load of the overview
    await this._updateGlyphOverview();
  }

  async _getSidebarForGlyphOverview() {
    const element = html.div({ class: "font-overview-sidebar" });

    // font source selector
    this.fontSourceInput = select(
      {
        id: "font-source-select",
        style: "width: 100%;",
        onchange: (event) => {
          this.currentFontSourceIdentifier = event.target.value;
          this.locationController.model.fontLocationSourceMapped = {
            ...this.fontSources[this.currentFontSourceIdentifier].location,
          };
        },
      },
      []
    );

    this.fontSourceInput.innerHTML = "";

    for (const fontSourceIdentifier of this.sortedSourceIdentifiers) {
      const sourceName = this.fontSources[fontSourceIdentifier].name;
      this.fontSourceInput.appendChild(
        option(
          {
            value: fontSourceIdentifier,
            selected: this.currentFontSourceIdentifier === fontSourceIdentifier,
          },
          [sourceName]
        )
      );
    }

    const fontSourceSelector = div(
      {
        class: "font-source-selector",
      },
      [
        label(
          { for: "font-source-select" },
          translate("sidebar.font-overview.font-source")
        ),
        this.fontSourceInput,
      ]
    );

    // glyph search
    this.glyphsSearch = new GlyphsSearchForOverview(
      this.glyphsListItemsController,
      "glyphsListItems"
    );
    this.glyphsSearch.glyphMap = this.fontController.glyphMap;

    const glyphsSearch = html.div({ class: "glyph-search" }, [this.glyphsSearch]);

    element.appendChild(glyphsSearch);
    element.appendChild(fontSourceSelector);
    return element;
  }

  async _updateGlyphOverview() {
    const glyphs = this.glyphsListItemsController.model.glyphsListItems;
    console.log("glyphs", glyphs);
    const element = document.querySelector("#font-overview-panel");
    element.innerHTML = "";

    if (!glyphs.length) {
      return element;
    }

    const sectionHeader = html.span({ class: "font-overview-section-header" }, [
      translate("Glyphs"),
    ]);
    element.appendChild(sectionHeader);

    // TODO: Handle sections, but for now only one with all glyphs or selectiojn of 'Search'.
    const glyphCellsSection = html.div({ class: "glyph-cells-section" });
    const documentFragment = document.createDocumentFragment({
      class: "glyph-cells-wrapper",
    });
    for (const { glyphName, unicodes } of glyphs) {
      const glyphCellWrapper = html.div({ class: "glyph-cell-wrapper" });
      const glyphCell = new GlyphCell(
        this.fontController,
        glyphName,
        unicodes,
        this.locationController,
        "fontLocationSourceMapped"
      );
      glyphCell.ondblclick = () => this.handleDoubleClick(glyphName, unicodes);
      // TODO: context menu
      // glyphCell.addEventListener("contextmenu", (event) =>
      //   this.handleContextMenu(event, glyphCell, item)
      // );
      glyphCellWrapper.appendChild(glyphCell);
      documentFragment.appendChild(glyphCellWrapper);
    }
    glyphCellsSection.appendChild(documentFragment);
    element.appendChild(glyphCellsSection);
  }

  async handleDoubleClick(glyphName, codePoints) {
    const url = new URL(window.location);
    url.pathname = url.pathname.replace("/fontoverview/", "/editor/");

    const sourceLocation = this.fontSources[this.currentFontSourceIdentifier]
      ? this.fontSources[this.currentFontSourceIdentifier].location
      : {};
    const userLocation =
      this.fontController.mapSourceLocationToUserLocation(sourceLocation);

    const viewInfo = {
      selectedGlyph: glyphName,
      location: userLocation,
    };
    if (codePoints.length) {
      viewInfo.text =
        0x002f === codePoints[0] ? "//" : String.fromCharCode(codePoints[0]);
    } else {
      viewInfo.text = `/${glyphName}`;
    }
    url.hash = dumpURLFragment(viewInfo);
    window.open(url.toString());
  }

  async messageFromServer(headline, msg) {
    // don't await the dialog result, the server doesn't need an answer
    message(headline, msg);
  }
}
