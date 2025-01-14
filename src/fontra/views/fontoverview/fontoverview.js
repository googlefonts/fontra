import {
  doPerformAction,
  getActionIdentifierFromKeyEvent,
  registerActionCallbacks,
} from "../core/actions.js";
import { FontOverviewNavigation } from "./panel-navigation.js";
import { getGlyphMapProxy } from "/core/cmap.js";
import { makeFontraMenuBar } from "/core/fontra-menus.js";
import { GlyphOrganizer } from "/core/glyph-organizer.js";
import * as html from "/core/html-utils.js";
import { loaderSpinner } from "/core/loader-spinner.js";
import { translate } from "/core/localization.js";
import { ObservableController } from "/core/observable-object.js";
import { parseGlyphSet } from "/core/parse-glyph-set.js";
import {
  assert,
  dumpURLFragment,
  glyphMapToItemList,
  isActiveElementTypeable,
  modulo,
  range,
  readObjectFromURLFragment,
  scheduleCalls,
  throttleCalls,
  writeObjectToURLFragment,
} from "/core/utils.js";
import { ViewController } from "/core/view-controller.js";
import { GlyphCellView } from "/web-components/glyph-cell-view.js";
import { message } from "/web-components/modal-dialog.js";

const persistentSettings = [
  { key: "searchString" },
  { key: "fontLocationUser" },
  { key: "glyphSelection", toJSON: (v) => [...v], fromJSON: (v) => new Set(v) },
  { key: "closedGlyphSections", toJSON: (v) => [...v], fromJSON: (v) => new Set(v) },
  {
    key: "closedNavigationSections",
    toJSON: (v) => [...v],
    fromJSON: (v) => new Set(v),
  },
  { key: "groupByKeys" },
  { key: "projectGlyphSetSelection" },
  { key: "myGlyphSetSelection" },
  { key: "cellMagnification" },
];

const THIS_FONTS_GLYPHSET = "";
const PROJECT_GLYPH_SETS_CUSTOM_DATA_KEY = "fontra.projectGlyphSets";

function getDefaultFontOverviewSettings() {
  return {
    searchString: "",
    fontLocationUser: {},
    fontLocationSource: {},
    glyphSelection: new Set(),
    closedGlyphSections: new Set(),
    closedNavigationSections: new Set(),
    groupByKeys: [],
    projectGlyphSets: {},
    myGlyphSets: {},
    projectGlyphSetSelection: [THIS_FONTS_GLYPHSET],
    myGlyphSetSelection: [],
    glyphSetErrors: {},
    cellMagnification: 1,
  };
}

const CELL_MAGNIFICATION_FACTOR = 2 ** (1 / 4);
const CELL_MAGNIFICATION_MIN = 0.25;
const CELL_MAGNIFICATION_MAX = 4;

export class FontOverviewController extends ViewController {
  constructor(font) {
    super(font);

    this._loadedGlyphSets = {};

    this.initActions();

    const myMenuBar = makeFontraMenuBar(["File", "Edit", "View", "Font"], this);
    document.querySelector(".top-bar-container").appendChild(myMenuBar);

    this.updateGlyphSelection = throttleCalls(() => this._updateGlyphSelection(), 50);

    this.updateWindowLocation = scheduleCalls(
      (event) => this._updateWindowLocation(),
      200
    );
  }

  getViewMenuItems() {
    return [
      { actionIdentifier: "action.zoom-in" },
      { actionIdentifier: "action.zoom-out" },
    ];
  }

  async start() {
    await loaderSpinner(this._start());
  }

  async _start() {
    await this.fontController.initialize();

    this.fontSources = await this.fontController.getSources();

    window.addEventListener("popstate", (event) => {
      this._updateFromWindowLocation();
    });

    this.myGlyphSetsController = new ObservableController({ settings: {} });
    this.myGlyphSetsController.synchronizeWithLocalStorage("fontra-my-glyph-sets-");

    this.fontOverviewSettingsController = new ObservableController({
      ...getDefaultFontOverviewSettings(),
      projectGlyphSets: readProjectGlyphSets(this.fontController),
      myGlyphSets: this.myGlyphSetsController.model.settings,
    });
    this.fontOverviewSettings = this.fontOverviewSettingsController.model;

    this._setupProjectGlyphSetsDependencies();
    this._setupMyGlyphSetsDependencies();
    this._setupLocationDependencies();

    this._updateFromWindowLocation();

    this.fontOverviewSettingsController.addKeyListener(
      persistentSettings.map(({ key }) => key),
      (event) => {
        if (event.senderInfo?.senderID !== this) {
          this.updateWindowLocation();
        }
      }
    );

    this.fontOverviewSettingsController.addKeyListener("searchString", (event) => {
      this.glyphOrganizer.setSearchString(event.newValue);
      this.updateGlyphSelection();
    });

    this.fontOverviewSettingsController.addKeyListener("groupByKeys", (event) => {
      this.glyphOrganizer.setGroupByKeys(event.newValue);
      this.updateGlyphSelection();
    });

    this.fontOverviewSettingsController.addKeyListener(
      [
        "projectGlyphSets",
        "myGlyphSets",
        "projectGlyphSetSelection",
        "myGlyphSetSelection",
      ],
      (event) => {
        this.updateGlyphSelection();
      }
    );

    this.glyphOrganizer = new GlyphOrganizer();
    this.glyphOrganizer.setSearchString(this.fontOverviewSettings.searchString);
    this.glyphOrganizer.setGroupByKeys(this.fontOverviewSettings.groupByKeys);

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
      this.fontOverviewSettingsController,
      { locationKey: "fontLocationSource" }
    );

    this.fontOverviewSettingsController.addKeyListener("cellMagnification", (event) => {
      this.glyphCellView.magnification = event.newValue;
    });
    this.glyphCellView.magnification = this.fontOverviewSettings.cellMagnification;

    this.glyphCellView.onOpenSelectedGlyphs = (event) => this.openSelectedGlyphs();

    sidebarContainer.appendChild(this.navigation);
    glyphCellViewContainer.appendChild(this.glyphCellView);

    this.fontController.addChangeListener({ glyphMap: null }, () => {
      this._updateGlyphItemList();
    });

    document.addEventListener("keydown", (event) => this.handleKeyDown(event));

    this._updateGlyphItemList();
  }

  _setupProjectGlyphSetsDependencies() {
    this.fontController.addChangeListener(
      { customData: { [PROJECT_GLYPH_SETS_CUSTOM_DATA_KEY]: null } },
      (change, isExternalChange) => {
        if (isExternalChange) {
          this.fontOverviewSettingsController.setItem(
            "projectGlyphSets",
            readProjectGlyphSets(this.fontController),
            { sentFromExternalChange: true }
          );
        }
      }
    );

    this.fontOverviewSettingsController.addKeyListener(
      "projectGlyphSets",
      async (event) => {
        if (event.senderInfo?.sentFromExternalChange) {
          return;
        }
        const changes = await this.fontController.performEdit(
          "edit glyph sets",
          "customData",
          (root) => {
            const projectGlyphSets = Object.values(event.newValue).filter(
              (glyphSet) => glyphSet.url
            );
            root.customData[PROJECT_GLYPH_SETS_CUSTOM_DATA_KEY] = projectGlyphSets;
          },
          this
        );

        this.fontOverviewSettings.projectGlyphSetSelection =
          this.fontOverviewSettings.projectGlyphSetSelection.filter(
            (name) => !!event.newValue[name]
          );
      }
    );
  }

  _setupMyGlyphSetsDependencies() {
    // This synchronizes the myGlyphSets object with local storage
    this.fontOverviewSettingsController.addKeyListener("myGlyphSets", (event) => {
      if (!event.senderInfo?.sentFromLocalStorage) {
        this.myGlyphSetsController.setItem("settings", event.newValue, {
          sentFromSettings: true,
        });

        this.fontOverviewSettings.myGlyphSetSelection =
          this.fontOverviewSettings.myGlyphSetSelection.filter(
            (name) => !!event.newValue[name]
          );
      }
    });

    this.myGlyphSetsController.addKeyListener("settings", (event) => {
      if (!event.senderInfo?.sentFromSettings) {
        this.fontOverviewSettingsController.setItem("myGlyphSets", event.newValue, {
          sentFromLocalStorage: true,
        });
      }
    });
  }

  _setupLocationDependencies() {
    // TODO: This currently does *not* do avar-2 / cross-axis-mapping
    // - We need the "user location" to send to the editor
    // - We would need the "mapped source location" for the glyph cells
    // - We use the "user location" to store in the fontoverview URL fragment
    // - Mapping from "user" to "source" to "mapped source" is easy
    // - The reverse is not: see CrossAxisMapping.unmapLocation()

    this.fontOverviewSettingsController.addKeyListener(
      "fontLocationSource",
      (event) => {
        if (!event.senderInfo?.fromFontLocationUser) {
          this.fontOverviewSettingsController.withSenderInfo(
            { fromFontLocationSource: true },
            () => {
              this.fontOverviewSettingsController.model.fontLocationUser =
                this.fontController.mapSourceLocationToUserLocation(event.newValue);
            }
          );
        }
      }
    );

    this.fontOverviewSettingsController.addKeyListener("fontLocationUser", (event) => {
      if (!event.senderInfo?.fromFontLocationSource) {
        this.fontOverviewSettingsController.withSenderInfo(
          { fromFontLocationUser: true },
          () => {
            this.fontOverviewSettingsController.model.fontLocationSource =
              this.fontController.mapUserLocationToSourceLocation(event.newValue);
          }
        );
      }
    });
  }

  _updateFromWindowLocation() {
    const viewInfo = readObjectFromURLFragment();
    if (!viewInfo) {
      message("The URL is malformed", "The UI settings could not be restored."); // TODO: translation
      return;
    }
    const defaultSettings = getDefaultFontOverviewSettings();
    this.fontOverviewSettingsController.withSenderInfo({ senderID: this }, () => {
      for (const { key, fromJSON } of persistentSettings) {
        const value = viewInfo[key];
        if (value !== undefined) {
          this.fontOverviewSettings[key] = fromJSON?.(value) || value;
        } else {
          this.fontOverviewSettings[key] = defaultSettings[key];
        }
      }
    });
  }

  _updateWindowLocation() {
    const viewInfo = Object.fromEntries(
      persistentSettings.map(({ key, toJSON }) => [
        key,
        toJSON?.(this.fontOverviewSettings[key]) || this.fontOverviewSettings[key],
      ])
    );
    writeObjectToURLFragment(viewInfo);
  }

  _updateGlyphItemList() {
    this._glyphItemList = this.glyphOrganizer.sortGlyphs(
      glyphMapToItemList(this.fontController.glyphMap)
    );
    this._updateGlyphSelection();
  }

  async _updateGlyphSelection() {
    // We possibly need to be smarter about this:
    this.glyphCellView.parentElement.scrollTop = 0;

    const combinedGlyphItemList = await this._getCombineGlyphItemList();
    const glyphItemList = this.glyphOrganizer.filterGlyphs(combinedGlyphItemList);
    const glyphSections = this.glyphOrganizer.groupGlyphs(glyphItemList);
    this.glyphCellView.setGlyphSections(glyphSections);
  }

  async _getCombineGlyphItemList() {
    const combinedCharacterMap = {};
    const combinedGlyphMap = getGlyphMapProxy({}, combinedCharacterMap);

    const glyphSetKeys = [
      ...this.fontOverviewSettings.projectGlyphSetSelection,
      ...this.fontOverviewSettings.myGlyphSetSelection,
    ];
    glyphSetKeys.sort();

    for (const glyphSetKey of glyphSetKeys) {
      let glyphSet;
      if (glyphSetKey === "") {
        glyphSet = this._glyphItemList;
      } else {
        const glyphSetInfo =
          this.fontOverviewSettings.projectGlyphSets[glyphSetKey] ||
          this.fontOverviewSettings.myGlyphSets[glyphSetKey];

        if (!glyphSetInfo) {
          console.log(`can't find glyph set info for ${glyphSetKey}`);
          continue;
        }

        glyphSet = await this._loadGlyphSet(glyphSetInfo);
      }

      for (const { glyphName, codePoints } of glyphSet) {
        if (!combinedGlyphMap[glyphName]) {
          combinedGlyphMap[glyphName] = codePoints;
        }
      }
    }

    return glyphMapToItemList(combinedGlyphMap);
  }

  async _loadGlyphSet(glyphSetInfo) {
    assert(glyphSetInfo.url);
    const glyphSetErrors = { ...this.fontOverviewSettings.glyphSetErrors };

    let glyphSet = this._loadedGlyphSets[glyphSetInfo.url];
    if (!glyphSet) {
      let glyphSetData;
      try {
        const response = await fetch(glyphSetInfo.url);
        glyphSetData = await response.text();
        delete glyphSetErrors[glyphSetInfo.url];
      } catch (e) {
        console.log(`can't load ${glyphSetInfo.url}`);
        console.error();
        glyphSetErrors[glyphSetInfo.url] = `Could not load glyph set: ${e.toString()}`;
      }

      if (glyphSetData) {
        try {
          glyphSet = parseGlyphSet(glyphSetData, glyphSetInfo.dataFormat);
        } catch (e) {
          glyphSetErrors[
            glyphSetInfo.url
          ] = `Could not parse glyph set: ${e.toString()}`;
        }
      }

      this.fontOverviewSettings.glyphSetErrors = glyphSetErrors;

      if (glyphSet) {
        this._loadedGlyphSets[glyphSetInfo.url] = glyphSet;
      }
    }

    return glyphSet || [];
  }

  openSelectedGlyphs() {
    const selectedGlyphInfo = this.glyphCellView.getSelectedGlyphInfo();
    if (!selectedGlyphInfo.length) {
      return;
    }
    openGlyphsInEditor(
      selectedGlyphInfo,
      this.fontOverviewSettings.fontLocationUser,
      this.fontController.glyphMap
    );
  }

  handleKeyDown(event) {
    const actionIdentifier = getActionIdentifierFromKeyEvent(event);
    if (actionIdentifier) {
      event.preventDefault();
      event.stopImmediatePropagation();
      doPerformAction(actionIdentifier, event);
    } else {
      if (isActiveElementTypeable()) {
        // The cell area for sure doesn't have the focus
        return;
      }
      this.glyphCellView.handleKeyDown(event);
    }
  }

  handleRemoteClose(event) {
    //
  }

  handleRemoteError(event) {
    //
  }

  initActions() {
    registerActionCallbacks(
      "action.undo",
      () => this.doUndoRedo(false),
      () => this.canUndoRedo(false)
    );

    registerActionCallbacks(
      "action.redo",
      () => this.doUndoRedo(true),
      () => this.canUndoRedo(true)
    );

    registerActionCallbacks("action.zoom-in", () => this.zoomIn());
    registerActionCallbacks("action.zoom-out", () => this.zoomOut());
  }

  canUndoRedo(isRedo) {
    // For now we have no undo
    return false;
  }

  doUndoRedo(isRedo) {
    // Stub
    console.log(isRedo ? "redo" : "undo");
  }

  zoomIn() {
    this.fontOverviewSettings.cellMagnification = Math.min(
      this.fontOverviewSettings.cellMagnification * CELL_MAGNIFICATION_FACTOR,
      CELL_MAGNIFICATION_MAX
    );
  }

  zoomOut() {
    this.fontOverviewSettings.cellMagnification = Math.max(
      this.fontOverviewSettings.cellMagnification / CELL_MAGNIFICATION_FACTOR,
      CELL_MAGNIFICATION_MIN
    );
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

function readProjectGlyphSets(fontController) {
  return Object.fromEntries(
    [
      { name: "This font's glyphs", url: "" },
      ...(fontController.customData[PROJECT_GLYPH_SETS_CUSTOM_DATA_KEY] || []),
    ].map((glyphSet) => [glyphSet.url, glyphSet])
  );
}
