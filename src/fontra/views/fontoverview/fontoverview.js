import { FontOverviewNavigation } from "./panel-navigation.js";
import { GlyphOrganizer } from "/core/glyph-organizer.js";
import * as html from "/core/html-utils.js";
import { loaderSpinner } from "/core/loader-spinner.js";
import { translate } from "/core/localization.js";
import { ObservableController } from "/core/observable-object.js";
import {
  arrowKeyDeltas,
  commandKeyProperty,
  dumpURLFragment,
  glyphMapToItemList,
  isActiveElementTypeable,
  modulo,
  range,
  throttleCalls,
} from "/core/utils.js";
import { ViewController } from "/core/view-controller.js";
import { GlyphCellView } from "/web-components/glyph-cell-view.js";

export class FontOverviewController extends ViewController {
  constructor(font) {
    super(font);

    this.updateGlyphSelection = throttleCalls(() => this._updateGlyphSelection(), 50);
  }

  async start() {
    await loaderSpinner(this._start());
  }

  async _start() {
    await this.fontController.initialize();

    this.fontSources = await this.fontController.getSources();

    this.fontOverviewSettingsObserver = new ObservableController({
      searchString: "",
      fontSourceIdentifier: null,
      fontLocationSourceMapped: {},
      glyphSelection: new Set(),
    });
    this.fontOverviewSettings = this.fontOverviewSettingsObserver.model;

    this.fontOverviewSettingsObserver.addKeyListener(
      "fontSourceIdentifier",
      (event) => {
        const sourceLocation = {
          ...this.fontSources[event.newValue]?.location,
        }; // A font may not have any font sources, therefore the ?-check

        this.fontOverviewSettings.fontLocationSourceMapped =
          this.fontController.mapSourceLocationToUserLocation(sourceLocation);
      }
    );
    // Note: once we add an axis slider UI, we should do the opposite mapping,
    // too, from location to source identifier

    this.fontOverviewSettings.fontSourceIdentifier =
      this.fontController.fontSourcesInstancer.defaultSourceIdentifier;

    this.fontOverviewSettingsObserver.addKeyListener("searchString", (event) => {
      this.glyphOrganizer.setSearchString(event.newValue);
      this.updateGlyphSelection();
    });

    this.glyphOrganizer = new GlyphOrganizer();

    const rootSubscriptionPattern = {};
    for (const rootKey of this.fontController.getRootKeys()) {
      rootSubscriptionPattern[rootKey] = null;
    }
    rootSubscriptionPattern["glyphs"] = null;
    await this.fontController.subscribeChanges(rootSubscriptionPattern, false);

    const sidebarContainer = document.querySelector("#sidebar-container");
    const glyphCellViewContainer = document.querySelector("#glyph-cell-view-container");

    this.navigation = new FontOverviewNavigation(this);

    this.glyphCellView = new GlyphCellView(
      this.fontController,
      this.fontOverviewSettingsObserver
    );

    // // This is how we can change the cell size:
    // this.glyphCellView.style.setProperty("--glyph-cell-scale-factor-override", "1");

    this.glyphCellView.ondblclick = (event) => this.handleDoubleClick(event);

    sidebarContainer.appendChild(this.navigation);
    glyphCellViewContainer.appendChild(this.glyphCellView);

    this.fontController.addChangeListener({ glyphMap: null }, () => {
      this._updateGlyphItemList();
    });
    this._updateGlyphItemList();
  }

  _updateGlyphItemList() {
    this._glyphItemList = this.glyphOrganizer.sortGlyphs(
      glyphMapToItemList(this.fontController.glyphMap)
    );
    this._updateGlyphSelection();
  }

  _updateGlyphSelection() {
    // We possibly need to be smarter about this:
    this.glyphCellView.parentElement.scrollTop = 0;

    const glyphItemList = this.glyphOrganizer.filterGlyphs(this._glyphItemList);
    this.glyphCellView.setGlyphItems(glyphItemList);
  }

  handleDoubleClick(event) {
    this.openSelectedGlyphs();
  }

  openSelectedGlyphs() {
    openGlyphsInEditor(
      this.glyphCellView.getSelectedGlyphInfo(),
      this.fontOverviewSettings.fontLocationSourceMapped,
      this.fontController.glyphMap
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

function openGlyphsInEditor(glyphsInfo, userLocation, glyphMap) {
  const url = new URL(window.location);
  url.pathname = url.pathname.replace("/fontoverview/", "/editor/");

  const viewInfo = {
    location: userLocation,
    text: "",
  };

  if (glyphsInfo.length === 1) {
    viewInfo.selectedGlyph = {
      lineIndex: 0,
      glyphIndex: 0,
      isEditing: glyphsInfo[0].glyphName in glyphMap,
    };
  }

  for (const { glyphName, codePoints } of glyphsInfo) {
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
