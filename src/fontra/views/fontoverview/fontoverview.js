import * as html from "/core/html-utils.js";
import { loaderSpinner } from "/core/loader-spinner.js";
import { translate } from "/core/localization.js";
import { ObservableController } from "/core/observable-object.js";
import { difference, symmetricDifference, union } from "/core/set-ops.js";
import {
  arrowKeyDeltas,
  commandKeyProperty,
  dumpURLFragment,
  modulo,
  range,
  throttleCalls,
} from "/core/utils.js";
import { ViewController } from "/core/view-controller.js";
import { GlyphCell } from "/web-components/glyph-cell.js";
import { GlyphsSearchField } from "/web-components/glyphs-search-field.js";
import { Accordion } from "/web-components/ui-accordion.js";

// TODOs:
// - Do we want to make the sidebar scalable? If so, we may want to refactor sidebar-resize-gutter or at least have a look at it. Follow up task?
// - Context menu is not implemented in the overview, yet. We may want to add them. As follow up task. Related to 6. Add top menu bar.
// - Maybe use https://www.npmjs.com/package/unicode-properties for overview sections. Also, how to we handle unencoded glyphs? As follow up task!
// - Add top menu bar, please see: https://github.com/googlefonts/fontra/issues/1845

export class FontOverviewController extends ViewController {
  constructor(font) {
    super(font);

    this.locationController = new ObservableController({
      fontLocationSourceMapped: {},
    });

    this.glyphsListItemsController = new ObservableController({
      glyphsListItems: [],
    });

    this.contentElement = this.getContentElement();

    this.throttledUpdate = throttleCalls(() => this.update(), 50);
    this._glyphSelection = new Set();

    document.addEventListener("keydown", (event) => this.handleKeyDown(event));
    // document.addEventListener("keyup", (event) => this.handleKeyUp(event));
    this.previousArrowDirection = "ArrowRight";
  }

  async start() {
    await loaderSpinner(this._start());
  }

  async _start() {
    await this.fontController.initialize();
    const rootSubscriptionPattern = {};
    for (const rootKey of this.fontController.getRootKeys()) {
      rootSubscriptionPattern[rootKey] = null;
    }
    rootSubscriptionPattern["glyphs"] = null;
    await this.fontController.subscribeChanges(rootSubscriptionPattern, false);

    this.fontSources = await this.fontController.getSources();

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

    // This is the initial load of the overview
    await this.update();
  }

  async _getSidebarForGlyphOverview() {
    const element = html.div({ class: "font-overview-sidebar" });

    // font source selector
    this.fontSourceInput = html.select(
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
        html.option(
          {
            value: fontSourceIdentifier,
            selected: this.currentFontSourceIdentifier === fontSourceIdentifier,
          },
          [sourceName]
        )
      );
    }

    const fontSourceSelector = html.div(
      {
        class: "font-source-selector",
      },
      [
        html.label(
          { for: "font-source-select" },
          translate("sidebar.font-overview.font-source")
        ),
        this.fontSourceInput,
      ]
    );

    // glyph search
    this.glyphsSearch = new GlyphsSearchField(
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
        this.accordion.showHideAccordionItem(item, hasResult);
        results.push(hasResult);
      });
    }
  }

  async _updateAccordionItem(item) {
    const element = item.content;

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
      for (const { glyphName, unicodes } of glyphs) {
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
          this.handleSingleClick(event, glyphCell);
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

    return !hideAccordionItem;
  }

  get glyphSelection() {
    return this._glyphSelection;
  }

  set glyphSelection(selection) {
    const diff = symmetricDifference(selection, this.glyphSelection);
    this.forEachGlyphCell((glyphCell) => {
      if (diff.has(glyphCell.glyphName)) {
        glyphCell.selected = selection.has(glyphCell.glyphName);
      }
    });
    this._glyphSelection = selection;
  }

  forEachGlyphCell(func) {
    for (const glyphCell of this.iterGlyphCells()) {
      func(glyphCell);
    }
  }

  *iterGlyphCells() {
    for (const glyphCell of this.accordion.shadowRoot.querySelectorAll("glyph-cell")) {
      yield glyphCell;
    }
  }

  async handleSingleClick(event, glyphCell) {
    if (event.detail > 1) {
      // Part of a double click, we should do nothing and let handleDoubleClick
      // deal with the event
      return;
    }

    const glyphName = glyphCell.glyphName;

    if (this.glyphSelection.has(glyphName)) {
      if (event.shiftKey) {
        this.glyphSelection = difference(this.glyphSelection, [glyphName]);
      }
    } else {
      if (event.shiftKey) {
        this.glyphSelection = union(this.glyphSelection, [glyphName]);
      } else {
        this.glyphSelection = new Set([glyphName]);
      }
    }
  }

  async handleDoubleClick(element, glyphName, codePoints) {
    const selectedGlyphs = this.glyphs.filter((glyphInfo) =>
      this.glyphSelection.has(glyphInfo.glyphName)
    );

    const url = new URL(window.location);
    url.pathname = url.pathname.replace("/fontoverview/", "/editor/");

    const sourceLocation = this.fontSources[this.currentFontSourceIdentifier]
      ? this.fontSources[this.currentFontSourceIdentifier].location
      : {};
    const userLocation =
      this.fontController.mapSourceLocationToUserLocation(sourceLocation);

    const viewInfo = {
      location: userLocation,
      text: "",
    };

    if (selectedGlyphs.length === 1) {
      viewInfo.selectedGlyph = { lineIndex: 0, glyphIndex: 0, isEditing: true };
    }

    for (const { glyphName, unicodes } of selectedGlyphs) {
      const codePoints = unicodes;
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

  handleKeyDown(event) {
    if (event.key in arrowKeyDeltas) {
      this.handleArrowKeys(event);
      event.preventDefault();
      return;
    }
    // TODO: maybe:
    // select all via command + a
    // and unselect all via command + shift + a
  }

  handleArrowKeys(event) {
    // // I am so, so sorry, but the following code is a mess. I am not proud of it.
    // // There is a lot of duplicate code, because I am still figuring out the behavior.
    // // TODO: Implement arrow key handling. But first we need to specify the behavior. Maybe:
    // // - if no other key is pressed, we can navigate through the glyphs: done.
    // // - if shift or command is pressed, we can add or remove to the selection with left and right arrow keys
    // // - shift + up and down arrow keys can be used to add or remove whole lines to the selection
    // const glyphCells = this.makeListOfAllGlyphCells();
    // const selectPrevious = event.key === "ArrowLeft" || event.key === "ArrowUp";
    // let index = glyphCells.findIndex(
    //   (cell) => cell.glyphName === this.lastGlyphSelected
    // );
    // if (event.key === "ArrowUp" || event.key === "ArrowDown") {
    //   // if shiftKey delta is 10 if we go to the right, -10 if we go to the left
    //   const delta = 10; //TODO: should be number of cells in a row for adding or removing a whole row
    //   if (this.previousArrowDirection !== event.key) {
    //     if (this.previousArrowDirection === "ArrowUp") {
    //       --index;
    //     } else if (this.previousArrowDirection === "ArrowDown") {
    //       ++index;
    //     }
    //   }
    //   let newIndex =
    //     index == -1
    //       ? selectPrevious
    //         ? glyphCells.length - 1
    //         : 0
    //       : modulo(index + (selectPrevious ? -delta : delta), glyphCells.length);
    //   const newGlyphCell = glyphCells[newIndex];
    //   const newGlyph = {
    //     glyphName: newGlyphCell.glyphName,
    //     codePoints: newGlyphCell.codePoints,
    //   };
    //   const deselectGlyphs = newGlyphCell.isSelected;
    //   if (!event.shiftKey && !event[commandKeyProperty]) {
    //     this.deselectAllGlyphs();
    //     this.glyphSelection = [newGlyph];
    //     newGlyphCell.selected = true;
    //   } else {
    //     // add or remove multiple glyph cells to the selection with left and right arrow keys
    //     const minIndex = Math.min(index, newIndex);
    //     const maxIndex = Math.max(index, newIndex);
    //     for (const i of range(minIndex, maxIndex)) {
    //       const glyphCell = glyphCells[i];
    //       const glyph = {
    //         glyphName: glyphCell.glyphName,
    //         codePoints: glyphCell.codePoints,
    //       };
    //       // if we change the direction of the arrow key, we need to remove the last glyph
    //       // TODO: This is not working as expected, we need to fix this.
    //       // I somehow have a logic error here with switching the direction of the arrow key while holding shift.
    //       if (deselectGlyphs) {
    //         // seems like we need to remove glyphs from the selection
    //         const j = this.glyphSelection.indexOf(glyph);
    //         this.glyphSelection.splice(j, 1);
    //         glyphCell.selected = false;
    //       } else {
    //         this.glyphSelection.push(glyph);
    //         glyphCell.selected = true;
    //       }
    //     }
    //   }
    //   this.lastGlyphSelected = newGlyphCell.glyphName;
    //   this.previousArrowDirection = event.key;
    //   return;
    // }
    // // Select next or previous glyph-cell
    // // This is needed if we change the direction of the arrow key
    // if (this.previousArrowDirection !== event.key) {
    //   if (this.previousArrowDirection === "ArrowLeft") {
    //     --index;
    //   } else if (this.previousArrowDirection === "ArrowRight") {
    //     ++index;
    //   }
    // }
    // let newIndex =
    //   index == -1
    //     ? selectPrevious
    //       ? glyphCells.length - 1
    //       : 0
    //     : modulo(index + (selectPrevious ? -1 : 1), glyphCells.length);
    // const glyphCell = glyphCells[index];
    // const newGlyphCell = glyphCells[newIndex];
    // const newGlyph = {
    //   glyphName: newGlyphCell.glyphName,
    //   codePoints: newGlyphCell.codePoints,
    // };
    // // First, if no key is pressed, we can navigate through the glyphs
    // if (!event.shiftKey && !event[commandKeyProperty]) {
    //   this.deselectAllGlyphs();
    //   this.glyphSelection = [newGlyph];
    //   newGlyphCell.selected = true;
    // } else {
    //   if (newGlyphCell.isSelected) {
    //     // remove glyph from selection
    //     const i = this.glyphSelection.indexOf(newGlyph);
    //     this.glyphSelection.splice(i, 1);
    //     newGlyphCell.selected = false;
    //   } else {
    //     this.glyphSelection.push(newGlyph);
    //     newGlyphCell.selected = true;
    //   }
    // }
    // newGlyphCell.scrollIntoView({
    //   behavior: "auto",
    //   block: "nearest",
    //   inline: "nearest",
    // });
    // this.lastGlyphSelected = newGlyphCell.glyphName;
    // this.previousArrowDirection = event.key;
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
