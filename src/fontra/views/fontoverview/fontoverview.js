import { FontController } from "../core/font-controller.js";
import * as html from "../core/html-utils.js";
import { ObservableController } from "../core/observable-object.js";
import { getRemoteProxy } from "../core/remote.js";
import { commandKeyProperty, enumerate } from "../core/utils.js";
import { mapAxesFromUserSpaceToSourceSpace } from "../core/var-model.js";
import { makeDisplayPath } from "../core/view-utils.js";
import { translate } from "/core/localization.js";
import { findParentWithClass } from "/editor/panel-related-glyphs.js"; // see TODOs below.
import { GlyphCell } from "/web-components/glyph-cell.js";
import { message } from "/web-components/modal-dialog.js";
import { Accordion } from "/web-components/ui-accordion.js";

// TODOs:
// - Refactor GlyphsSearch, please see #1867
// - Refactor findParentWithClass: please see #1866
// - Do we want to make the sidebar scalable? If so, we may want to refactor sidebar-resize-gutter or at least have a look at it. Follow up task?
// - Context menu is not implemented in the overview, yet. We may want to add them. As follow up task. Related to 6. Add top menu bar.
// - Maybe use https://www.npmjs.com/package/unicode-properties for overview sections. Also, how to we handle unencoded glyphs? As follow up task!
// - Add top menu bar, please see: https://github.com/googlefonts/fontra/issues/1845

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

    this.contentElement = this.getContentElement();

    this.throttledUpdate = throttleCalls(() => this.update(), 50);
    this.glyphSelection = [];
  }

  async start() {
    await this.fontController.initialize();
    this.fontSources = await this.fontController.getSources();
    this.fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(
      this.fontController.axes.axes
    );
    this.sortedSourceIdentifiers =
      await this.fontController.getSortedSourceIdentifiers();
    this.currentFontSourceIdentifier =
      this.fontController.fontSourcesInstancer.defaultSourceIdentifier;
    this.locationController.model.fontLocationSourceMapped = {
      ...this.fontSources[this.currentFontSourceIdentifier]?.location,
    }; // Note: a font may not have font sources therefore the ?-check.

    const sidebarContainer = document.querySelector("#sidebar-container");
    const panelContainer = document.querySelector("#panel-container");

    const sidebarElement = await this._getSidebarForGlyphOverview();
    sidebarContainer.appendChild(sidebarElement);
    panelContainer.appendChild(this.contentElement);

    this.glyphsListItemsController.addKeyListener(
      "glyphsListItems",
      this.throttledUpdate
    );

    // This is the inital load of the overview
    await this.update();
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

  getContentElement() {
    this.accordion = new Accordion();

    this.accordion.appendStyle(`
    .placeholder-label {
      font-size: 0.9em;
      opacity: 40%;
    }

    .font-overview-accordion-item {
      height: 100%;
      width: 100%;
      overflow-y: scroll;
      white-space: normal;
    }
    `);

    // TODO: refactor this if we implement different sections. For now only one section.
    this.accordion.items = [
      {
        label: translate("font-overview.glyphs"),
        open: true,
        content: html.div({ class: "font-overview-accordion-item" }, []),
        section: "Glyphs",
      },
    ];

    return html.div(
      {
        class: "sidebar-glyph-relationships",
      },
      [this.accordion]
    );
  }

  async update() {
    this.glyphs = this.glyphsListItemsController.model.glyphsListItems;

    const results = [];

    for (const item of this.accordion.items) {
      this._updateAccordionItem(item).then((hasResult) => {
        results.push(hasResult);
      });
    }
  }

  async _updateAccordionItem(item) {
    const element = item.content;
    const parent = findParentWithClass(element, "ui-accordion-item");

    element.innerHTML = "";
    let hideAccordionItem = true;

    element.appendChild(
      html.span({ class: "placeholder-label" }, [
        translate("sidebar.related-glyphs.loading"), // TODO: general loading key.
      ])
    );
    const glyphs = await this.getGlyphs(item.section);

    if (glyphs?.length) {
      const documentFragment = document.createDocumentFragment();
      for (const [index, { glyphName, unicodes }] of enumerate(glyphs)) {
        const glyphCell = new GlyphCell(
          this.fontController,
          glyphName,
          unicodes,
          this.locationController,
          "fontLocationSourceMapped"
        );
        glyphCell.ondblclick = (event) =>
          this.handleDoubleClick(element, glyphName, unicodes);
        glyphCell.onclick = (event) => {
          // INFO: We need to delay the single click event to allow for a double click to happen.
          setTimeout(() => {
            this.handleSingleClick(event, element, glyphCell);
          }, 200);
        };

        // TODO: context menu
        // glyphCell.addEventListener("contextmenu", (event) =>
        //   this.handleContextMenu(event, glyphCell, item)
        // );

        documentFragment.appendChild(glyphCell);
      }
      element.innerHTML = "";
      element.appendChild(documentFragment);

      // At least in Chrome, we need to reset the scroll position, but it doesn't
      // work if we do it right away, only after the next event iteration.
      setTimeout(() => {
        element.scrollTop = 0;
      }, 0);

      hideAccordionItem = false;
    } else {
      element.innerHTML = "";
    }

    parent.hidden = hideAccordionItem;
    return !hideAccordionItem;
  }

  async handleSingleClick(event, element, glyphCell) {
    const glyphName = glyphCell.glyphName;
    const unicodes = glyphCell.codePoints;

    if (event[commandKeyProperty]) {
      if (glyphCell.isSelected) {
        // remove glyph from selection
        const glyph = this.glyphSelection.find(
          (glyph) => glyph.glyphName === glyphName
        );
        const index = this.glyphSelection.indexOf(glyph);
        this.glyphSelection.splice(index, 1);
        glyphCell.setIsSelected(false);

        // we removed the last clicked glyph, therefore set the last glyph of selection as last clicked glyph
        this.lastClickedGlyphName =
          this.glyphSelection[this.glyphSelection.length - 1]?.glyphName;
      } else {
        // add single character to selection with command key
        this.glyphSelection.push({ glyphName: glyphName, codePoints: unicodes });
        glyphCell.setIsSelected(true);
        this.lastClickedGlyphName = glyphName;
      }
      return;
    }

    if (this.lastClickedGlyphName && event.shiftKey) {
      const glyphCells = Array.from(element.children);

      const lastClickedIndex = glyphCells.findIndex(
        (cell) => cell.glyphName === this.lastClickedGlyphName
      );
      const clickedIndex = glyphCells.findIndex((cell) => cell.glyphName === glyphName);

      const start = Math.min(lastClickedIndex, clickedIndex);
      const end = Math.max(lastClickedIndex, clickedIndex);

      for (let i = start; i <= end; i++) {
        const cell = glyphCells[i];
        this.glyphSelection.push({
          glyphName: cell.glyphName,
          codePoints: cell.codePoints,
        });
        cell.setIsSelected(true);
      }
    } else {
      // replace selection
      // first remove all selected glyphs
      for (const cell of element.children) {
        if (this.glyphSelection.some((glyph) => glyph.glyphName === cell.glyphName)) {
          cell.setIsSelected(false);
        }
      }
      // then add the new selected glyph
      this.glyphSelection = [{ glyphName: glyphName, codePoints: unicodes }];
      glyphCell.setIsSelected(true);
      this.lastClickedGlyphName = glyphName;
    }
  }

  async handleDoubleClick(element, glyphName, codePoints) {
    const url = new URL(window.location);
    url.pathname = url.pathname.replace("/fontoverview/", "/editor/");

    const sourceLocation = this.fontSources[this.currentFontSourceIdentifier]
      ? this.fontSources[this.currentFontSourceIdentifier].location
      : {};
    const userLocation =
      this.fontController.mapSourceLocationToUserLocation(sourceLocation);

    const viewInfo = {
      selectedGlyph: glyphName, // TODO: selection does not work, yet.
      location: userLocation,
      text: "",
    };

    // if glyphName is not in the selection, it's a double click on a single glyph
    if (!this.glyphSelection.some((glyph) => glyph.glyphName === glyphName)) {
      for (const cell of element.children) {
        if (this.glyphSelection.some((glyph) => glyph.glyphName === cell.glyphName)) {
          cell.setIsSelected(false);
        }
      }
      this.glyphSelection = [{ glyphName: glyphName, codePoints: codePoints }];
    }

    for (const { glyphName, codePoints } of this.glyphSelection) {
      if (codePoints.length) {
        viewInfo.text +=
          0x002f === codePoints[0] ? "//" : String.fromCodePoint(codePoints[0]);
      } else {
        viewInfo.text += `/${glyphName}`;
      }
    }

    url.hash = dumpURLFragment(viewInfo);
    window.open(url.toString());
  }

  async messageFromServer(headline, msg) {
    // don't await the dialog result, the server doesn't need an answer
    message(headline, msg);
  }

  async getGlyphs(section) {
    // TODO: section. For now return all glyphs
    return this.glyphs;
  }

  handleRemoteClose(event) {
    //
  }

  handleRemoteError(event) {
    //
  }
}
