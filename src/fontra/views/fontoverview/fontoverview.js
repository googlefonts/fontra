import { FontOverviewNavigation } from "./panel-navigation.js";
import * as html from "/core/html-utils.js";
import { loaderSpinner } from "/core/loader-spinner.js";
import { translate } from "/core/localization.js";
import { ObservableController } from "/core/observable-object.js";
import {
  arrowKeyDeltas,
  commandKeyProperty,
  dumpURLFragment,
  isActiveElementTypeable,
  modulo,
  range,
  throttleCalls,
} from "/core/utils.js";
import { ViewController } from "/core/view-controller.js";
import { GlyphCellView } from "/web-components/glyph-cell-view.js";

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

    this.throttledUpdate = throttleCalls(() => this.update(), 50);

    // document.addEventListener("keydown", (event) => this.handleKeyDown(event));
    // document.addEventListener("keyup", (event) => this.handleKeyUp(event));
    // this.previousArrowDirection = "ArrowRight";
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

    const sidebarContainer = document.querySelector("#sidebar-container");
    const glyphCellViewContainer = document.querySelector("#glyph-cell-view-container");

    this.navigation = new FontOverviewNavigation(this);
    await this.navigation.start();

    this.glyphCellView = new GlyphCellView(
      this.fontController,
      this.locationController
    );

    this.glyphCellView.ondblclick = (event) => this.handleDoubleClick(event);

    sidebarContainer.appendChild(this.navigation);
    glyphCellViewContainer.appendChild(this.glyphCellView);

    this.glyphsListItemsController.addKeyListener(
      "glyphsListItems",
      this.throttledUpdate
    );

    this.update();
  }

  update() {
    this.glyphCellView.update(this.glyphsListItemsController.model.glyphsListItems);
  }

  handleDoubleClick(event) {
    this.openSelectedGlyphs();
  }

  openSelectedGlyphs() {
    openGlyphsInEditor(
      this.glyphCellView.getSelectedGlyphInfo(),
      this.navigation.getUserLocation()
    );
  }

  handleKeyDown(event) {
    if (isActiveElementTypeable()) {
      // The cell area for sure doesn't have the focus
      return;
    }
    // if (event.key in arrowKeyDeltas) {
    //   this.handleArrowKeys(event);
    //   event.preventDefault();
    //   return;
    // }
    // TODO: maybe:
    // select all via command + a
    // and unselect all via command + shift + a
  }

  handleRemoteClose(event) {
    //
  }

  handleRemoteError(event) {
    //
  }
}

function openGlyphsInEditor(glyphsInfo, userLocation) {
  const url = new URL(window.location);
  url.pathname = url.pathname.replace("/fontoverview/", "/editor/");

  const viewInfo = {
    location: userLocation,
    text: "",
  };

  if (glyphsInfo.length === 1) {
    viewInfo.selectedGlyph = { lineIndex: 0, glyphIndex: 0, isEditing: true };
  }

  for (const { glyphName, unicodes } of glyphsInfo) {
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
