import { CanvasController } from "../core/canvas-controller.js";
import { applyChange, matchChangePath } from "../core/changes.js";
import { recordChanges } from "../core/change-recorder.js";
import { ContextMenu, MenuItemDivider } from "../core/context-menu.js";
import { FontController } from "../core/font-controller.js";
import { loaderSpinner } from "../core/loader-spinner.js";
import { ObservableController } from "../core/observable-object.js";
import {
  centeredRect,
  insetRect,
  offsetRect,
  rectCenter,
  rectFromArray,
  rectToArray,
  rectSize,
  scaleRect,
} from "../core/rectangle.js";
import { getRemoteProxy } from "../core/remote.js";
import { SceneView } from "../core/scene-view.js";
import { Form } from "../core/ui-form.js";
import { StaticGlyph } from "../core/var-glyph.js";
import { addItemwise, subItemwise, mulScalar } from "../core/var-funcs.js";
import { piecewiseLinearMap } from "/core/var-model.js";
import { joinPaths } from "../core/var-path.js";
import * as html from "/core/unlit.js";
import {
  fetchJSON,
  getCharFromUnicode,
  hasShortcutModifierKey,
  hyphenatedToCamelCase,
  makeUPlusStringFromCodePoint,
  objectsEqual,
  parseSelection,
  scheduleCalls,
  throttleCalls,
  range,
  readFromClipboard,
  reversed,
  writeToClipboard,
} from "../core/utils.js";
import { themeController } from "/core/theme-settings.js";
import { dialog } from "/web-components/dialog-overlay.js";
import { SceneController } from "./scene-controller.js";
import { SceneModel } from "./scene-model.js";
import { HandTool } from "./edit-tools-hand.js";
import { PenTool } from "./edit-tools-pen.js";
import { PointerTool } from "./edit-tools-pointer.js";
import { VisualizationLayers } from "./visualization-layers.js";
import {
  allGlyphsCleanVisualizationLayerDefinition,
  visualizationLayerDefinitions,
} from "./visualization-layer-definitions.js";
import {
  deleteSelectedPoints,
  filterPathByPointIndices,
} from "../core/path-functions.js";
import { staticGlyphToGLIF } from "../core/glyph-glif.js";
import { pathToSVG } from "../core/glyph-svg.js";

export class EditorController {
  static async fromWebSocket() {
    const pathItems = window.location.pathname.split("/").slice(3);
    const displayPath = makeDisplayPath(pathItems);
    document.title = `Fontra — ${decodeURI(displayPath)}`;
    const projectPath = pathItems.join("/");
    const protocol = window.location.protocol === "http:" ? "ws" : "wss";
    const wsURL = `${protocol}://${window.location.host}/websocket/${projectPath}`;

    const remoteFontEngine = await getRemoteProxy(wsURL);
    const editorController = new EditorController(remoteFontEngine);
    remoteFontEngine.receiver = editorController;
    remoteFontEngine.onclose = (event) => editorController.handleRemoteClose(event);
    remoteFontEngine.onerror = (event) => editorController.handleRemoteError(event);
    await editorController.start();
    return editorController;
  }

  constructor(font) {
    this.fontController = new FontController(font, {});
    this.fontController.addEditListener(
      async (...args) => await this.editListenerCallback(...args)
    );
    this.autoViewBox = true;
    const canvas = document.querySelector("#edit-canvas");
    canvas.focus();

    const canvasController = new CanvasController(canvas, (magnification) =>
      this.canvasMagnificationChanged(magnification)
    );
    this.canvasController = canvasController;
    // We need to do isPointInPath without having a context, we'll pass a bound method
    const isPointInPath = canvasController.context.isPointInPath.bind(
      canvasController.context
    );

    this.clipboardFormatController = new ObservableController({ format: "glif" });
    this.clipboardFormatController.synchronizeWithLocalStorage("fontra-clipboard-");

    this.visualizationLayers = new VisualizationLayers(
      visualizationLayerDefinitions,
      this.isThemeDark
    );

    this.visualizationLayersSettings = newVisualizationLayersSettings(
      this.visualizationLayers
    );
    this.visualizationLayersSettings.addListener((key, newValue) => {
      this.visualizationLayers.toggle(key, newValue);
      this.canvasController.requestUpdate();
    });

    const sceneModel = new SceneModel(this.fontController, isPointInPath);

    const sceneView = new SceneView(sceneModel, (model, controller) =>
      this.visualizationLayers.drawVisualizationLayers(model, controller)
    );
    canvasController.sceneView = sceneView;

    this.defaultSceneView = sceneView;

    this.cleanGlyphsLayers = new VisualizationLayers(
      [allGlyphsCleanVisualizationLayerDefinition],
      this.isThemeDark
    );
    this.cleanSceneView = new SceneView(sceneModel, (model, controller) => {
      this.cleanGlyphsLayers.drawVisualizationLayers(model, controller);
    });

    this.sceneController = new SceneController(sceneModel, canvasController);
    // TODO move event stuff out of here
    this.sceneController.addEventListener("selectedGlyphChanged", async (event) => {
      await this.updateSlidersAndSources();
      this.sourcesList.setSelectedItemIndex(
        await this.sceneController.getSelectedSource()
      );
    });
    this.sceneController.addEventListener(
      "selectedGlyphIsEditingChanged",
      async (event) => {
        this.updateWindowLocation();
      }
    );
    this.sceneController.addEventListener("doubleClickedComponents", async (event) => {
      this.doubleClickedComponentsCallback(event);
    });

    this.initSidebars();
    this.initContextMenuItems();
    this.initShortCuts();
    this.initMiniConsole();
    this.infoForm = new Form("selection-info");

    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addListener((event) => this.themeChanged());
    themeController.addListener((key, newValue) => {
      this.themeChanged();
    });

    this.canvasController.canvas.addEventListener("contextmenu", (event) =>
      this.contextMenuHandler(event)
    );
    window.addEventListener("mousedown", (event) => this.dismissContextMenu(event));
    window.addEventListener("blur", (event) => this.dismissContextMenu(event));

    window.addEventListener("keydown", (event) => this.keyDownHandler(event));
    window.addEventListener("keyup", (event) => this.keyUpHandler(event));

    this.enteredText = "";
    this.updateWindowLocation = scheduleCalls(
      (event) => this._updateWindowLocation(),
      200
    );
    this.updateSelectionInfo = throttleCalls(
      async (event) => await this._updateSelectionInfo(),
      100
    );
    this.updateSlidersAndSourcesThrottled = throttleCalls(
      async () => await this.updateSlidersAndSources(),
      200
    );
    canvas.addEventListener("viewBoxChanged", (event) => {
      if (event.detail === "canvas-size") {
        this.setAutoViewBox();
      } else {
        this.autoViewBox = false;
      }
      this.updateWindowLocation();
    });
    this.sceneController.addEventListener("selectedGlyphChanged", () =>
      this.updateWindowLocationAndSelectionInfo()
    );
    this.sceneController.addEventListener("selectionChanged", async () => {
      this.updateWindowLocationAndSelectionInfo();
    });

    window.addEventListener("popstate", (event) => {
      this.setupFromWindowLocation();
    });

    document.addEventListener("visibilitychange", (event) => {
      if (this._reconnectDialogResult) {
        if (document.visibilityState === "visible") {
          this._reconnectDialogResult.cancel();
        } else {
          this._reconnectDialogResult.hide();
        }
      }
    });

    this.updateWithDelay();
  }

  async updateWithDelay() {
    // The first time ever on the page (or after a deep reload), we draw before
    // all webfonts are fully loaded, and any undefined glyphs show the wrong UI
    // font. Let's just reload after a tiny delay.
    //
    // Doing the following should help, but it doesn't, unless we add the delay.
    // await document.fonts.ready;
    setTimeout(() => this.canvasController.requestUpdate(), 50);
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
    await this.fontController.subscribeChanges(rootSubscriptionPattern, false);
    await this.initGlyphsSearch();
    await this.initSliders();
    this.initTools();
    this.initSourcesList();
    // Delay a tiny amount to account for a delay in the sidebars being set up,
    // which affects the available viewBox
    setTimeout(() => this.setupFromWindowLocation(), 20);
  }

  async initGlyphsSearch() {
    this.glyphsSearch = document.querySelector("#glyphs-search");
    this.glyphsSearch.glyphMap = this.fontController.glyphMap;
    this.glyphsSearch.addEventListener("selectedGlyphNameChanged", (event) =>
      this.glyphNameChangedCallback(event.detail)
    );
  }

  async initSliders() {
    this.sliders = document.querySelector("#designspace-location");
    this.sliders.axes = await this.sceneController.getAxisInfo();
    this.sliders.addEventListener(
      "locationChanged",
      scheduleCalls(async (event) => {
        await this.sceneController.setLocation(event.detail.values);
        this.sourcesList.setSelectedItemIndex(
          await this.sceneController.getSelectedSource()
        );
        this.updateWindowLocationAndSelectionInfo();
        this.autoViewBox = false;
      })
    );
  }

  async initUserSettings() {
    const userSettings = document.querySelector("#user-settings");
    const items = [];

    // Visualization layer settings
    const layers = this.visualizationLayers.definitions.filter(
      (layer) => layer.userSwitchable
    );
    const layerItems = layers.map((layer) => {
      return { key: layer.identifier, displayName: layer.name, ui: "checkbox" };
    });
    items.push({
      displayName: "Glyph editor appearance",
      controller: this.visualizationLayersSettings,
      descriptions: layerItems,
    });

    // Clipboard settings
    items.push({
      displayName: "Clipboard export format",
      controller: this.clipboardFormatController,
      descriptions: [
        {
          key: "format",
          ui: "radio",
          options: [
            { key: "glif", displayName: "GLIF (RoboFont)" },
            { key: "svg", displayName: "SVG" },
            { key: "fontra-json", displayName: "JSON (Fontra)" },
          ],
        },
      ],
    });

    // Theme settings
    items.push({
      displayName: "Theme settings",
      controller: themeController,
      descriptions: [
        {
          key: "theme",
          ui: "radio",
          options: [
            { key: "automatic", displayName: "Automatic (use OS setting)" },
            { key: "light", displayName: "Light" },
            { key: "dark", displayName: "Dark" },
          ],
        },
      ],
    });

    // Server info
    const serverInfo = await fetchJSON("/serverinfo");
    items.push({
      displayName: "Server info",
      controller: null,
      descriptions: Object.entries(serverInfo).flatMap((entry) => {
        return [
          {
            displayName: entry[0] + ":",
            ui: "header",
          },
          {
            displayName: entry[1],
            ui: "plain",
          },
        ];
      }),
    });

    userSettings.items = items;
  }

  initTools() {
    this.tools = {
      "pointer-tool": new PointerTool(this),
      "pen-tool": new PenTool(this),
      "hand-tool": new HandTool(this),
    };
    for (const toolElement of document.querySelectorAll(
      "#edit-tools > .tool-button > div"
    )) {
      const toolIdentifier = toolElement.id;
      toolElement.onclick = () => {
        this.setSelectedTool(toolIdentifier);
      };
    }
    this.setSelectedTool("pointer-tool");

    for (const zoomElement of document.querySelectorAll(
      "#zoom-tools > .tool-button > div"
    )) {
      const toolIdentifier = zoomElement.id;
      zoomElement.onclick = () => {
        switch (toolIdentifier) {
          case "zoom-in":
            this.zoomIn();
            break;
          case "zoom-out":
            this.zoomOut();
            break;
          case "zoom-fit-selection":
            this.zoomFit();
            break;
        }
      };
    }
  }

  initSourcesList() {
    const columnDescriptions = [
      { key: "sourceName", width: "14em" },
      // {"key": "sourceIndex", "width": "2em"},
    ];
    this.sourcesList = document.querySelector("#sources-list");
    this.sourcesList.columnDescriptions = columnDescriptions;

    // TODO: relocate those to somewhere more appropriate after implementation
    const addSourceCallback = () => {
      console.log("add a source");
    };
    const removeSourceCallback = () => {
      console.log("remove a source");
    };
    this.addRemoveSourceButtons = document.querySelector(
      "#sources-list-add-remove-buttons"
    );
    this.addRemoveSourceButtons.addButtonCallback = addSourceCallback;
    this.addRemoveSourceButtons.removeButtonCallback = removeSourceCallback;
    this.addRemoveSourceButtons.hidden = true;

    this.sourcesList.addEventListener("listSelectionChanged", async (event) => {
      await this.sceneController.setSelectedSource(
        event.detail.getSelectedItem().sourceIndex
      );
      this.sliders.values = this.sceneController.getLocation();
      this.updateWindowLocationAndSelectionInfo();
      this.autoViewBox = false;
    });
    this.sourcesList.addEventListener("rowDoubleClicked", (event) => {
      this.editSourceProperties(event.detail.doubleClickedRowIndex);
    });
  }

  async editSourceProperties(sourceIndex) {
    const glyphController =
      await this.sceneController.sceneModel.getSelectedVariableGlyphController();

    const glyph = glyphController.glyph;
    const localAxisNames = glyph.axes.map((axis) => axis.name);
    const globalAxes = mapAxesFromUserSpaceToDesignspace(
      // Don't include global axes that also exist as local axes
      this.fontController.globalAxes.filter(
        (axis) => !localAxisNames.includes(axis.name)
      )
    );
    const locationAxes = [
      ...globalAxes,
      ...(globalAxes.length && glyph.axes.length ? [{ isDivider: true }] : []),
      ...glyph.axes,
    ];
    const source = glyph.sources[sourceIndex];
    const locationController = new ObservableController({ ...source.location });
    const nameController = new ObservableController({
      sourceName: source.name,
      layerName: source.layerName,
    });
    const contentFunc = async (dialogBox) => {
      const locationElement = html.createDomElement("designspace-location", {
        style: `grid-column: 1 / -1;
          min-height: 0;
          overflow: scroll;
          height: 100%;
        `,
      });
      locationElement.axes = locationAxes;
      locationElement.controller = locationController;
      const contentElement = html.div(
        {
          style: `overflow: hidden;
            white-space: nowrap;
            display: grid;
            gap: 0.5em;
            grid-template-columns: max-content auto;
            align-items: center;
            height: 100%;
            min-height: 0;
          `,
        },
        [
          ...labeledTextInput("Source name:", nameController, "sourceName"),
          ...labeledTextInput("Layer:", nameController, "layerName", {
            placeholderKey: "sourceName",
          }),
          html.br(),
          locationElement,
        ]
      );
      return contentElement;
    };
    const result = await dialog("Source properties", contentFunc, [
      { title: "Cancel", isCancelButton: true },
      { title: "Done", isDefaultButton: true },
    ]);
    if (!result) {
      return;
    }
    const locationModel = locationController.model;
    const newLocation = Object.fromEntries(
      locationAxes
        .filter(
          (axis) =>
            locationModel[axis.name] !== undefined &&
            locationModel[axis.name] !== axis.defaultValue
        )
        .map((axis) => [axis.name, locationModel[axis.name]])
    );
    await this.sceneController.editGlyphAndRecordChanges((glyph) => {
      const source = glyph.sources[sourceIndex];
      if (!objectsEqual(source.location, newLocation)) {
        source.location = newLocation;
      }
      if (nameController.model.sourceName !== source.name) {
        source.name = nameController.model.sourceName;
      }
      const layerName =
        nameController.model.layerName || nameController.model.sourceName;
      if (layerName !== source.layerName) {
        source.layerName = layerName;
      }
      return "edit source properties";
    });
    // Update UI
    await this.updateSlidersAndSources();
  }

  initSidebars() {
    // Upon reload, the "animating" class may still be set (why?), so remove it
    for (const sidebarContainer of document.querySelectorAll(".sidebar-container")) {
      sidebarContainer.classList.remove("animating");
    }

    // Restore the sidebar selection/visible state from localStorage.
    // (Due to the previous step only being visible after an event loop iteration,
    // ensure we postpone just enough.)
    setTimeout(() => {
      for (const side of ["left", "right"]) {
        const selectedSidebar = localStorage.getItem(`fontra-selected-sidebar-${side}`);
        if (selectedSidebar) {
          this.toggleSidebar(selectedSidebar, false);
        }
      }
    }, 0);

    // After the initial set up we want clicking the sidebar tabs to animate in and out
    // (Here we can afford a longer delay.)
    setTimeout(() => {
      for (const sidebarContainer of document.querySelectorAll(".sidebar-container")) {
        sidebarContainer.classList.add("animating");
      }
    }, 100);

    for (const sidebarTab of document.querySelectorAll(".sidebar-tab")) {
      sidebarTab.addEventListener("click", (event) => {
        this.toggleSidebar(sidebarTab.dataset.sidebarName);
      });
    }

    // TODO: the remaining code deserves its own method
    this.textEntryElement = document.querySelector("#text-entry-textarea");
    this.textEntryElement.addEventListener(
      "input",
      () => {
        this.textFieldChangedCallback(this.textEntryElement);
        this.fixTextEntryHeight();
      },
      false
    );

    const textAlignMenuElement = document.querySelector("#text-align-menu");
    const textSettingsController = new ObservableController();
    this.textSettings = textSettingsController.model;

    textSettingsController.addListener((key, newValue) => {
      if (key !== "align") {
        return;
      }
      const align = this.textSettings.align;
      this.setTextAlignment(align);
      for (const el of textAlignMenuElement.children) {
        el.classList.toggle("selected", align === el.innerText.slice(5));
      }
    });

    for (const el of textAlignMenuElement.children) {
      el.onclick = (event) => {
        if (event.target.classList.contains("selected")) {
          return;
        }
        this.textSettings.align = el.innerText.slice(5);
      };
    }
  }

  toggleSidebar(sidebarName, doUpdateWindowLocation = true) {
    const toggledTab = document.querySelector(
      `.sidebar-tab[data-sidebar-name="${sidebarName}"]`
    );
    const side = toggledTab.parentElement.classList.contains("left") ? "left" : "right";
    const sidebarContainer = document.querySelector(`.sidebar-container.${side}`);
    const sidebars = {};
    for (const sideBarContent of document.querySelectorAll(
      `.sidebar-container.${side} > .sidebar-content`
    )) {
      sidebars[sideBarContent.dataset.sidebarName] = sideBarContent;
    }

    for (const item of document.querySelectorAll(
      `.tab-overlay-container.${side} > .sidebar-tab`
    )) {
      const sidebarContent = sidebars[item.dataset.sidebarName];
      if (item === toggledTab) {
        const isSidebarVisible = sidebarContainer.classList.contains("visible");
        const isSelected = item.classList.contains("selected");
        if (isSelected == isSidebarVisible && doUpdateWindowLocation) {
          // Sidebar visibility will change
          this.updateWindowLocation?.();
          // dispatch event?
        }
        item.classList.toggle("selected", !isSelected);
        sidebarContainer.classList.toggle("visible", !isSelected);
        const shadowBox = document.querySelector(
          `.tab-overlay-container.${side} > .sidebar-shadow-box`
        );
        if (isSelected) {
          setTimeout(() => {
            sidebarContent?.classList.remove("selected");
            shadowBox?.classList.remove("visible");
          }, 120); // timing should match sidebar-container transition
        } else {
          sidebarContent?.classList.add("selected");
          shadowBox?.classList.add("visible");
        }
      } else {
        item.classList.remove("selected");
        sidebarContent?.classList.remove("selected");
      }
    }

    const onOff = toggledTab.classList.contains("selected");
    localStorage.setItem(`fontra-selected-sidebar-${side}`, onOff ? sidebarName : "");
    const methodName = hyphenatedToCamelCase("toggle-" + sidebarName);
    setTimeout(() => this[methodName]?.call(this, onOff), 10);
    return onOff;
  }

  fixTextEntryHeight() {
    // This adapts the text entry height to its content
    this.textEntryElement.style.height = "auto";
    this.textEntryElement.style.height = this.textEntryElement.scrollHeight + 14 + "px";
  }

  async setTextAlignment(align) {
    const [minXPre, maxXPre] =
      this.sceneController.sceneModel.getTextHorizontalExtents();
    if (minXPre === 0 && maxXPre === 0) {
      // It's early, the scene is still empty, don't manipulate the view box
      await this.sceneController.setTextAlignment(align);
      return;
    }
    const viewBox = this.canvasController.getViewBox();
    await this.sceneController.setTextAlignment(align);
    const [minXPost, maxXPost] =
      this.sceneController.sceneModel.getTextHorizontalExtents();
    this.canvasController.setViewBox(offsetRect(viewBox, minXPost - minXPre, 0));
    this.updateWindowLocation();
  }

  initMiniConsole() {
    this.miniConsole = document.querySelector("#mini-console");
    this._console_log = console.log.bind(console);
    const clearMiniConsole = scheduleCalls(() => {
      this.miniConsole.innerText = "";
      this.miniConsole.style.display = "none";
    }, 5000);
    console.log = (...args) => {
      this._console_log(...args);
      this.miniConsole.innerText = args
        .map((item) => {
          try {
            return typeof item == "string" ? item : JSON.stringify(item);
          } catch (error) {
            return item;
          }
        })
        .join(" ");
      this.miniConsole.style.display = "inherit";
      clearMiniConsole();
    };
  }

  setSelectedTool(toolIdentifier) {
    for (const editToolItem of document.querySelectorAll(
      "#edit-tools > .tool-button"
    )) {
      editToolItem.classList.toggle(
        "selected",
        editToolItem.firstElementChild.id === toolIdentifier
      );
    }
    this.sceneController.setSelectedTool(this.tools[toolIdentifier]);
  }

  themeChanged() {
    this.visualizationLayers.darkTheme = this.isThemeDark;
    this.cleanGlyphsLayers.darkTheme = this.isThemeDark;
    this.canvasController.requestUpdate();
  }

  get isThemeDark() {
    const themeValue = themeController.model.theme;
    if (themeValue === "automatic") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    } else {
      return themeValue === "dark";
    }
  }

  canvasMagnificationChanged(magnification) {
    this.visualizationLayers.scaleFactor = 1 / magnification;
    this.cleanGlyphsLayers.scaleFactor = 1 / magnification;
  }

  async glyphNameChangedCallback(glyphName) {
    const codePoint = this.fontController.codePointForGlyph(glyphName);
    const glyphInfo = { glyphName: glyphName };
    if (codePoint !== undefined) {
      glyphInfo["character"] = getCharFromUnicode(codePoint);
    }
    const selectedGlyphState = this.sceneController.getSelectedGlyphState();
    const glyphLines = this.sceneController.getGlyphLines();
    if (selectedGlyphState) {
      glyphLines[selectedGlyphState.lineIndex][selectedGlyphState.glyphIndex] =
        glyphInfo;
      await this.setGlyphLines(glyphLines);
      this.sceneController.setSelectedGlyphState(selectedGlyphState);
    } else {
      if (!glyphLines.length) {
        glyphLines.push([]);
      }
      const lineIndex = glyphLines.length - 1;
      glyphLines[lineIndex].push(glyphInfo);
      await this.setGlyphLines(glyphLines);
      this.sceneController.setSelectedGlyphState({
        lineIndex: lineIndex,
        glyphIndex: glyphLines[lineIndex].length - 1,
        isEditing: false,
      });
    }
    this.updateTextEntryFromGlyphLines();
    await this.updateSlidersAndSources();
    this.setAutoViewBox();
  }

  updateTextEntryFromGlyphLines() {
    this.enteredText = textFromGlyphLines(this.sceneController.getGlyphLines());
    this.textEntryElement.value = this.enteredText;
  }

  async textFieldChangedCallback(element) {
    this.setGlyphLinesFromText(element.value);
  }

  async setGlyphLines(glyphLines) {
    await loaderSpinner(this.sceneController.setGlyphLines(glyphLines));
  }

  async setGlyphLinesFromText(text) {
    this.enteredText = text;
    await this.fontController.ensureInitialized;
    const glyphLines = await glyphLinesFromText(
      this.enteredText,
      this.fontController.characterMap,
      this.fontController.glyphMap,
      (codePoint) => this.fontController.getSuggestedGlyphName(codePoint),
      (glyphName) => this.fontController.getUnicodeFromGlyphName(glyphName)
    );
    await this.setGlyphLines(glyphLines);
    await this.updateSlidersAndSources();
    this.setAutoViewBox();
  }

  async updateSlidersAndSources() {
    const axisInfo = await this.sceneController.getAxisInfo();
    const numGlobalAxes = this.fontController.globalAxes.length;
    if (numGlobalAxes && axisInfo.length != numGlobalAxes) {
      axisInfo.splice(numGlobalAxes, 0, { isDivider: true });
    }
    this.sliders.axes = axisInfo;
    this.sliders.values = this.sceneController.getLocation();
    const sourceItems = await this.sceneController.getSourcesInfo();
    this.sourcesList.setItems(sourceItems || []);
    this.addRemoveSourceButtons.hidden = !sourceItems;
    this.updateWindowLocationAndSelectionInfo();
  }

  async doubleClickedComponentsCallback(event) {
    const glyphController =
      this.sceneController.sceneModel.getSelectedStaticGlyphController();
    const instance = glyphController.instance;
    const localLocations = {};
    const glyphInfos = [];

    for (const componentIndex of this.sceneController.doubleClickedComponentIndices) {
      const glyphName = instance.components[componentIndex].name;
      const location = instance.components[componentIndex].location;
      if (location) {
        localLocations[glyphName] = location;
      }
      const glyphInfo = { glyphName: glyphName };
      const codePoint = this.fontController.codePointForGlyph(glyphName);
      if (codePoint !== undefined) {
        glyphInfo["character"] = getCharFromUnicode(codePoint);
      }
      glyphInfos.push(glyphInfo);
    }
    this.sceneController.updateLocalLocations(localLocations);
    const selectedGlyphInfo = this.sceneController.getSelectedGlyphState();
    const glyphLines = this.sceneController.getGlyphLines();
    glyphLines[selectedGlyphInfo.lineIndex].splice(
      selectedGlyphInfo.glyphIndex + 1,
      0,
      ...glyphInfos
    );
    await this.setGlyphLines(glyphLines);
    this.sceneController.selectedGlyph = `${selectedGlyphInfo.lineIndex}/${
      selectedGlyphInfo.glyphIndex + 1
    }`;
    this.updateTextEntryFromGlyphLines();
    await this.updateSlidersAndSources();
    this.setAutoViewBox();
  }

  initContextMenuItems() {
    this.basicContextMenuItems = [];
    for (const isRedo of [false, true]) {
      this.basicContextMenuItems.push({
        title: () => this.getUndoRedoLabel(isRedo),
        enabled: () => this.canUndoRedo(isRedo),
        callback: () => this.doUndoRedo(isRedo),
        shortCut: { keysOrCodes: "z", metaKey: true, shiftKey: isRedo },
      });
    }
    this.basicContextMenuItems.push(MenuItemDivider);

    if (window.safari !== undefined && window.location.protocol === "http:") {
      // In Safari, the async clipboard API only works in a secure context
      // (HTTPS). We apply a workaround using the clipboard event API, but
      // only in Safari, and when in an HTTP context
      this.initFallbackClipboardEventListeners();
    } else {
      this.basicContextMenuItems.push(
        {
          title: "Cut",
          enabled: () => this.canCut(),
          callback: () => this.doCut(),
          shortCut: { keysOrCodes: "x", metaKey: true, shiftKey: false },
        },
        {
          title: "Copy",
          enabled: () => this.canCopy(),
          callback: () => this.doCopy(),
          shortCut: { keysOrCodes: "c", metaKey: true, shiftKey: false },
        },
        {
          title: "Paste",
          enabled: () => this.canPaste(),
          callback: () => this.doPaste(),
          shortCut: { keysOrCodes: "v", metaKey: true, shiftKey: false },
        }
      );
    }

    this.basicContextMenuItems.push(
      // {
      //   title: "Deep Paste",
      //   enabled: () => this.canDeepPaste(),
      //   callback: () => this.doDeepPaste(),
      //   shortCut: { keysOrCodes: "v", metaKey: true, shiftKey: true },
      // },
      {
        title: "Delete",
        enabled: () => this.canDelete(),
        callback: (event) => this.doDelete(event),
        shortCut: {
          keysOrCodes: ["Delete", "Backspace"],
          metaKey: false,
          shiftKey: false,
        },
      }
    );

    this.basicContextMenuItems.push(MenuItemDivider);

    for (const selectNone of [false, true]) {
      this.basicContextMenuItems.push({
        title: selectNone ? "Select None" : "Select All",
        enabled: () => this.canSelectAllNone(selectNone),
        callback: () => this.doSelectAllNone(selectNone),
        shortCut: { keysOrCodes: "a", metaKey: true, shiftKey: selectNone },
      });
    }

    this.glyphEditContextMenuItems = [];

    this.glyphEditContextMenuItems.push({
      title: "Add Component",
      enabled: () => this.canAddComponent(),
      callback: () => this.doAddComponent(),
      shortCut: undefined,
    });

    this.glyphEditContextMenuItems.push(...this.sceneController.getContextMenuItems());
  }

  initShortCuts() {
    this.shortCutHandlers = {};

    this.registerShortCut(["Space"], { metaKey: false, repeat: false }, () => {
      this.spaceKeyDownHandler();
    });

    this.registerShortCut("-", { metaKey: true, globalOverride: true }, () => {
      this.zoomOut();
    });
    this.registerShortCut("+=", { metaKey: true, globalOverride: true }, () => {
      this.zoomIn();
    });
    this.registerShortCut("0", { metaKey: true, globalOverride: true }, () => {
      this.zoomFit();
    });
    this.registerShortCut("123456789", { metaKey: false }, (event) => {
      const toolIndex = parseInt(event.key) - 1;
      if (toolIndex < Object.keys(this.tools).length) {
        this.setSelectedTool(Object.keys(this.tools)[toolIndex]);
      }
    });
    this.registerShortCut("f", { metaKey: true, globalOverride: true }, () => {
      if (this.toggleSidebar("glyph-search")) {
        this.glyphsSearch.focusSearchField();
      }
    });
    this.registerShortCut("i", { metaKey: true, globalOverride: true }, () => {
      this.toggleSidebar("sidebar-selection-info");
    });

    for (const menuItem of this.basicContextMenuItems) {
      if (menuItem.shortCut) {
        this.registerShortCut(
          menuItem.shortCut.keysOrCodes,
          menuItem.shortCut,
          menuItem.callback
        );
      }
    }
  }

  initFallbackClipboardEventListeners() {
    window.addEventListener("paste", async (event) => {
      if (document.activeElement === this.canvasController.canvas) {
        event.preventDefault();
        this.doPaste();
      }
    });

    window.addEventListener("copy", async (event) => {
      if (document.activeElement === this.canvasController.canvas) {
        event.preventDefault();
        await this.doCopy(event);
      }
    });

    window.addEventListener("cut", async (event) => {
      if (document.activeElement === this.canvasController.canvas) {
        event.preventDefault();
        await this.doCut(event);
      }
    });
  }

  registerShortCut(keysOrCodes, modifiers, callback) {
    //
    // Register a shortcut handler
    //
    // `keysOrCodes` is a list of event codes or a string or list of key strings.
    // Any item in the list or string will be seen as a trigger for the handler.
    //
    // `modifiers` is an object that allows you to match a specific boolean event
    // property. For example, { shiftKey: false } requires that the shift key must
    // not be pressed. If shiftKey is undefined, the state of the shift key is not
    // taken into account when matching the handler.
    //
    // `callback` is a callable that will be called with the event as its single
    // argument.
    //

    for (const keyOrCode of keysOrCodes) {
      const handlerDef = { ...modifiers, callback };
      if (!this.shortCutHandlers[keyOrCode]) {
        this.shortCutHandlers[keyOrCode] = [];
      }
      this.shortCutHandlers[keyOrCode].push(handlerDef);
    }
  }

  async keyDownHandler(event) {
    const callback = this._getShortCutCallback(event);
    if (callback !== undefined) {
      event.preventDefault();
      event.stopImmediatePropagation();
      await callback(event);
    }
  }

  _getShortCutCallback(event) {
    let handlerDefs = this.shortCutHandlers[event.key.toLowerCase()];
    if (!handlerDefs) {
      handlerDefs = this.shortCutHandlers[event.code];
    }
    if (!handlerDefs) {
      return undefined;
    }
    for (const handlerDef of handlerDefs) {
      if (isTypeableInput(document.activeElement) && !handlerDef.globalOverride) {
        continue;
      }
      if (
        handlerDef.metaKey !== undefined &&
        handlerDef.metaKey !== hasShortcutModifierKey(event)
      ) {
        continue;
      }
      if (!matchEvent(handlerDef, event)) {
        continue;
      }
      return handlerDef.callback;
    }
    return undefined;
  }

  getUndoRedoLabel(isRedo) {
    const info = this.sceneController.getUndoRedoInfo(isRedo);
    return (isRedo ? "Redo" : "Undo") + (info ? " " + info.label : "");
  }

  canUndoRedo(isRedo) {
    return !!this.sceneController.getUndoRedoInfo(isRedo);
  }

  async doUndoRedo(isRedo) {
    await this.sceneController.doUndoRedo(isRedo);
    // Hmmm would be nice if the following was done automatically
    await this.updateSlidersAndSources();
    this.sourcesList.setSelectedItemIndex(
      await this.sceneController.getSelectedSource()
    );
  }

  canCut() {
    return !!this.sceneController.selection.size;
  }

  async doCut(event = null) {
    if (!this.sceneController.selection.size) {
      return;
    }
    if (event) {
      // We *have* to do this first, as it won't work after any
      // await (Safari insists on that). So we have to do a bit
      // of redundant work by calling _prepareCopyOrCut twice.
      const { instance, path } = this._prepareCopyOrCut();
      await this._writeInstanceToClipboard(instance, path, event);
    }
    let copyResult;
    await this.sceneController.editInstanceAndRecordChanges((instance) => {
      copyResult = this._prepareCopyOrCut(instance, true);
      this.sceneController.selection = new Set();
      return "Cut Selection";
    });
    if (copyResult && !event) {
      const { instance, path } = copyResult;
      await this._writeInstanceToClipboard(instance, path);
    }
  }

  canCopy() {
    return this.sceneController.selectedGlyph;
  }

  async doCopy(event) {
    const { instance, path } = this._prepareCopyOrCut();
    if (!instance) {
      return;
    }
    await this._writeInstanceToClipboard(instance, path, event);
  }

  async _writeInstanceToClipboard(instance, path, event) {
    const bounds = path.getControlBounds();
    if (!bounds) {
      // nothing to do
      return;
    }

    const svgString = pathToSVG(path, bounds);
    const glyphName = this.sceneController.getSelectedGlyphName();
    const unicodes = this.fontController.glyphMap[glyphName] || [];
    const glifString = staticGlyphToGLIF(glyphName, instance, unicodes);
    const jsonString = JSON.stringify(instance);

    const mapping = { "svg": svgString, "glif": glifString, "fontra-json": jsonString };
    const plainTextString =
      mapping[this.clipboardFormatController.model.format] || glifString;

    localStorage.setItem("clipboardSelection.text-plain", plainTextString);
    localStorage.setItem("clipboardSelection.glyph", jsonString);

    if (event) {
      // This *has* to be called before anything is awaited, or
      // Safari won't recognize it as part of the same event handler
      event.clipboardData.setData("text/plain", plainTextString);
    } else {
      const clipboardObject = {
        "text/plain": plainTextString,
        "text/html": svgString,
        "web image/svg+xml": svgString,
        "web fontra/static-glyph": jsonString,
      };
      await writeToClipboard(clipboardObject);
    }
  }

  _prepareCopyOrCut(editInstance, doCut = false) {
    if (doCut !== !!editInstance) {
      throw new Error("assert -- inconsistent editInstance vs doCut argument");
    }
    const positionedGlyph =
      this.sceneController.sceneModel.getSelectedPositionedGlyph();
    const glyphController = positionedGlyph?.glyph;
    if (!glyphController) {
      return {};
    }

    if (!editInstance) {
      editInstance = glyphController.instance;
    }

    if (!this.sceneController.selection.size) {
      // No selection, fall back to "all", unless doCut is true
      return doCut
        ? {}
        : {
            instance: glyphController.instance,
            path: glyphController.flattenedPath,
          };
    }

    const { point: pointIndices, component: componentIndices } = parseSelection(
      this.sceneController.selection
    );
    let path;
    let components;
    const paths = [];
    if (pointIndices) {
      path = filterPathByPointIndices(editInstance.path, pointIndices, doCut);
      paths.push(path);
    }
    if (componentIndices) {
      paths.push(...componentIndices.map((i) => glyphController.components[i].path));
      components = componentIndices.map((i) => glyphController.instance.components[i]);
      if (doCut) {
        for (const componentIndex of reversed(componentIndices)) {
          editInstance.components.splice(componentIndex, 1);
        }
      }
    }
    const instance = StaticGlyph.fromObject({
      ...glyphController.instance,
      path: path,
      components: components,
    });
    return { instance: instance, path: joinPaths(paths) };
  }

  canPaste() {
    return true;
  }

  async doPaste() {
    let pastedGlyph;

    const plainText = await readFromClipboard("text/plain");
    if (!plainText) {
      return;
    }

    let customJSON;
    try {
      customJSON = await readFromClipboard("web fontra/static-glyph");
    } catch (error) {
      // fall through, try localStorage clipboard
    }

    if (
      !customJSON &&
      plainText === localStorage.getItem("clipboardSelection.text-plain")
    ) {
      customJSON = localStorage.getItem("clipboardSelection.glyph");
    }

    if (customJSON) {
      pastedGlyph = StaticGlyph.fromObject(JSON.parse(customJSON));
    } else {
      if (plainText[0] == "{") {
        try {
          pastedGlyph = StaticGlyph.fromObject(JSON.parse(plainText));
        } catch (error) {
          console.log("couldn't paste from JSON:", error.toString());
        }
      } else {
        pastedGlyph = await this.fontController.parseClipboard(plainText);
      }
    }

    if (!pastedGlyph) {
      return;
    }
    await this.sceneController.editInstanceAndRecordChanges((instance) => {
      const selection = new Set();
      for (const pointIndex of range(
        instance.path.numPoints,
        instance.path.numPoints + pastedGlyph.path.numPoints
      )) {
        selection.add(`point/${pointIndex}`);
      }
      for (const componentIndex of range(
        instance.components.length,
        instance.components.length + pastedGlyph.components.length
      )) {
        selection.add(`component/${componentIndex}`);
      }
      instance.path.appendPath(pastedGlyph.path);
      instance.components.splice(
        instance.components.length,
        0,
        ...pastedGlyph.components
      );
      this.sceneController.selection = selection;
      return "Paste";
    });
  }

  canDeepPaste() {
    return true;
  }

  doDeepPaste() {
    console.log("deep paste");
  }

  canDelete() {
    return (
      this.sceneController.selectedGlyphIsEditing &&
      this.sceneController.selection.size > 0
    );
  }

  async doDelete(event) {
    await this.sceneController.editInstanceAndRecordChanges((instance) => {
      if (event.altKey) {
        // Behave like "cut", but don't put anything on the clipboard
        this._prepareCopyOrCut(instance, true);
      } else {
        const { point: pointSelection, component: componentSelection } = parseSelection(
          this.sceneController.selection
        );
        if (pointSelection) {
          deleteSelectedPoints(instance.path, pointSelection);
        }
        if (componentSelection) {
          for (const componentIndex of reversed(componentSelection)) {
            instance.components.splice(componentIndex, 1);
          }
        }
      }
      this.sceneController.selection = new Set();
      return "Delete Selection";
    });
  }

  canAddComponent() {
    return this.sceneController.sceneModel.getSelectedPositionedGlyph()?.glyph.canEdit;
  }

  async doAddComponent() {
    let contentContainer;

    const getButton = () => {
      return contentContainer.getElementsByClassName("button-3")[0];
    };

    const glyphsSearch = document.createElement("glyphs-search");
    glyphsSearch.glyphMap = this.fontController.glyphMap;

    glyphsSearch.addEventListener("selectedGlyphNameChanged", (event) => {
      const okButton = getButton();
      okButton.classList.toggle("disabled", !glyphsSearch.getSelectedGlyphName());
    });

    glyphsSearch.addEventListener("selectedGlyphNameDoubleClicked", (event) => {
      const okButton = getButton();
      okButton.click();
    });

    const getResult = () => {
      return glyphsSearch.getSelectedGlyphName();
    };

    const contentFunc = (container) => {
      contentContainer = container;
      return glyphsSearch;
    };

    setTimeout(() => glyphsSearch.focusSearchField(), 50);

    const glyphName = await dialog("Add Component", contentFunc, [
      { title: "Cancel", isCancelButton: true },
      { title: "Add", isDefaultButton: true, getResult: getResult, disabled: true },
    ]);

    if (!glyphName) {
      // User cancelled
      return;
    }

    const transformation = {
      translateX: 0,
      translateY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
      skewX: 0,
      skewY: 0,
      tCenterX: 0,
      tCenterY: 0,
    };
    const baseGlyph = await this.fontController.getGlyph(glyphName);
    const location = Object.fromEntries(
      baseGlyph.glyph.axes.map((axis) => [axis.name, axis.defaultValue])
    );
    const newComponent = {
      name: glyphName,
      transformation: transformation,
      location: location,
    };

    await this.sceneController.editInstanceAndRecordChanges((instance) => {
      const newComponentIndex = instance.components.length;
      instance.components.push(newComponent);
      this.sceneController.selection = new Set([`component/${newComponentIndex}`]);
      return "Add Component";
    });
  }

  canSelectAllNone(selectNone) {
    return this.sceneController.selectedGlyphIsEditing;
  }

  doSelectAllNone(selectNone) {
    const positionedGlyph =
      this.sceneController.sceneModel.getSelectedPositionedGlyph();

    if (!positionedGlyph || !this.sceneController.selectedGlyphIsEditing) {
      return;
    }

    const newSelection = new Set();

    if (!selectNone) {
      const glyphPath = positionedGlyph.glyph.path;
      const glyphComponents = positionedGlyph.glyph.components;

      for (const [pointIndex] of glyphPath.pointTypes.entries()) {
        newSelection.add(`point/${pointIndex}`);
      }

      for (const [componentIndex] of glyphComponents.entries()) {
        newSelection.add(`component/${componentIndex}`);
      }
    }

    this.sceneController.selection = newSelection;
  }

  keyUpHandler(event) {
    if (event.code === "Space") {
      this.spaceKeyUpHandler();
      return;
    }
  }

  spaceKeyDownHandler(event) {
    if (isTypeableInput(document.activeElement)) {
      return;
    }
    this.canvasController.sceneView = this.cleanSceneView;
    this.canvasController.requestUpdate();
    for (const overlay of document.querySelectorAll(".cleanable-overlay")) {
      overlay.classList.add("overlay-layer-hidden");
    }
  }

  spaceKeyUpHandler(event) {
    this.canvasController.sceneView = this.defaultSceneView;
    this.canvasController.requestUpdate();
    for (const overlay of document.querySelectorAll(".cleanable-overlay")) {
      overlay.classList.remove("overlay-layer-hidden");
    }
  }

  contextMenuHandler(event) {
    event.preventDefault();
    const menuItems = [...this.basicContextMenuItems];
    if (this.sceneController.selectedGlyphIsEditing) {
      this.sceneController.updateContextMenuState(event);
      menuItems.push(MenuItemDivider);
      menuItems.push(...this.glyphEditContextMenuItems);
    }
    this.contextMenu = new ContextMenu("context-menu", menuItems);
  }

  dismissContextMenu(event) {
    if (!this.contextMenu || event.ctrlKey) {
      return;
    }
    if (event) {
      const el = this.contextMenu.element;
      if (event.target === el || event.target.offsetParent === el) {
        return;
      }
    }
    this.contextMenu.dismiss();
    delete this.contextMenu;
  }

  async newGlyph(glyphName, codePoint, templateInstance) {
    await this.fontController.newGlyph(glyphName, codePoint, templateInstance);
    this.sceneController.sceneModel.updateGlyphLinesCharacterMapping();
    await this.sceneController.sceneModel.updateScene();
    this.canvasController.requestUpdate();
    this.glyphsSearch.updateGlyphNamesListContent();
    this.updateWindowLocationAndSelectionInfo();
    await this.updateSlidersAndSources();
  }

  async externalChange(change) {
    const selectedGlyphName = this.sceneController.sceneModel.getSelectedGlyphName();
    const editState = this.sceneController.sceneModel.getSelectedGlyphState();

    await this.fontController.applyChange(change, true);

    if (matchChangePath(change, ["glyphMap"])) {
      this.sceneController.sceneModel.updateGlyphLinesCharacterMapping();
      if (editState?.isEditing && !this.fontController.hasGlyph(selectedGlyphName)) {
        // The glyph being edited got deleted, change state merely "selected"
        this.sceneController.sceneModel.setSelectedGlyphState({
          ...editState,
          isEditing: false,
        });
      }
      this.glyphsSearch.updateGlyphNamesListContent();
      await this.updateSlidersAndSources();
    }
    await this.sceneController.sceneModel.updateScene();
    if (
      selectedGlyphName !== undefined &&
      matchChangePath(change, ["glyphs", selectedGlyphName])
    ) {
      this.updateSelectionInfo();
      this.updateSlidersAndSourcesThrottled();
    }
    this.canvasController.requestUpdate();
  }

  async reloadData(reloadPattern) {
    for (const rootKey of Object.keys(reloadPattern)) {
      if (rootKey == "glyphs") {
        const glyphNames = Object.keys(reloadPattern["glyphs"] || {});
        if (glyphNames.length) {
          await this.reloadGlyphs(glyphNames);
        }
      } else {
        // TODO
        console.log(`reloading of non-glyph data is not yet implemented: ${rootKey}`);
      }
    }
  }

  async reloadGlyphs(glyphNames) {
    if (glyphNames.includes(this.sceneController.getSelectedGlyphName())) {
      // If the glyph being edited is among the glyphs to be reloaded,
      // cancel the edit, but wait for the cancellation to be completed,
      // or else the reload and edit can get mixed up and the glyph data
      // will be out of sync.
      await this.sceneController.cancelEditing(
        "Someone else made an edit just before you."
      );
    }
    await this.fontController.reloadGlyphs(glyphNames);
    await this.sceneController.sceneModel.updateScene();
    const selectedGlyphName = this.sceneController.sceneModel.getSelectedGlyphName();
    if (selectedGlyphName !== undefined && glyphNames.includes(selectedGlyphName)) {
      this.updateSelectionInfo();
      await this.updateSlidersAndSources();
    }
    this.canvasController.requestUpdate();
  }

  async messageFromServer(headline, message) {
    // don't await the dialog result, the server doesn't need an answer
    dialog(headline, message, [{ title: "Okay", isDefaultButton: true }]);
  }

  async setupFromWindowLocation() {
    const url = new URL(window.location);
    const viewInfo = {};
    for (const key of url.searchParams.keys()) {
      viewInfo[key] = JSON.parse(url.searchParams.get(key));
    }
    this.textSettings.align = viewInfo["align"] || "center";
    if (viewInfo["viewBox"]) {
      this.autoViewBox = false;
      const viewBox = viewInfo["viewBox"];
      if (viewBox.every((value) => !isNaN(value))) {
        this.canvasController.setViewBox(rectFromArray(viewBox));
      }
    }
    this.textEntryElement.value = viewInfo["text"] || "";
    this.textEntryElement.setSelectionRange(0, 0); // else it'll be at the end
    this.fixTextEntryHeight();
    if (viewInfo["text"]) {
      await this.setGlyphLinesFromText(viewInfo["text"]);
    } else {
      // Doing this directly avoids triggering rebuilding the window location
      this.sceneController.setGlyphLines([]);
    }
    this.sceneController.selectedGlyph = viewInfo["selectedGlyph"];
    await this.sceneController.setGlobalAndLocalLocations(
      viewInfo["location"],
      viewInfo["localLocations"]
    );
    if (viewInfo["location"]) {
      this.sliders.values = viewInfo["location"];
    }
    this.sceneController.selectedGlyphIsEditing =
      viewInfo["editing"] && !!viewInfo["selectedGlyph"];
    this.sourcesList.setSelectedItemIndex(
      await this.sceneController.getSelectedSource()
    );
    if (viewInfo["selection"]) {
      this.sceneController.selection = new Set(viewInfo["selection"]);
    }
    this.canvasController.requestUpdate();
  }

  _updateWindowLocation() {
    const viewInfo = {};
    const viewBox = this.canvasController.getViewBox();
    const url = new URL(window.location);
    let previousText = url.searchParams.get("text");
    if (previousText) {
      previousText = JSON.parse(previousText);
    }
    clearSearchParams(url.searchParams);

    if (Object.values(viewBox).every((value) => !isNaN(value))) {
      viewInfo["viewBox"] = rectToArray(viewBox).map(Math.round);
    }
    if (this.enteredText) {
      viewInfo["text"] = this.enteredText;
    }
    if (this.sceneController.selectedGlyph) {
      viewInfo["selectedGlyph"] = this.sceneController.selectedGlyph;
    }
    if (this.sceneController.selectedGlyphIsEditing) {
      viewInfo["editing"] = true;
    }
    viewInfo["location"] = this.sceneController.getGlobalLocation();
    const localLocations = this.sceneController.getLocalLocations(true);
    if (Object.keys(localLocations).length) {
      viewInfo["localLocations"] = localLocations;
    }
    const selArray = Array.from(this.sceneController.selection);
    if (selArray.length) {
      viewInfo["selection"] = Array.from(selArray);
    }
    if (this.sceneController.sceneModel.textAlignment !== "center") {
      viewInfo["align"] = this.sceneController.sceneModel.textAlignment;
    }
    for (const [key, value] of Object.entries(viewInfo)) {
      url.searchParams.set(key, JSON.stringify(value));
    }
    if (previousText !== viewInfo["text"]) {
      window.history.pushState({}, "", url);
    } else {
      window.history.replaceState({}, "", url);
    }
  }

  updateWindowLocationAndSelectionInfo() {
    this.updateSelectionInfo();
    this.updateWindowLocation();
  }

  toggleSidebarSelectionInfo(onOff) {
    if (onOff) {
      this.updateSelectionInfo?.();
    }
  }

  toggleTextEntry(onOff) {
    if (onOff) {
      this.fixTextEntryHeight();
      this.textEntryElement.focus();
    }
  }

  async toggleUserSettings(onOff) {
    if (onOff && !this._didInitUserSettings) {
      this._didInitUserSettings = true;
      await loaderSpinner(this.initUserSettings());
    }
  }

  async editListenerCallback(editMethodName, senderID, ...args) {
    if (senderID === this) {
      // The edit comes from the selection info box itself, so we shouldn't update it
      return;
    }
    if (editMethodName === "editIncremental" || editMethodName === "editFinal") {
      this.updateSelectionInfo();
    }
    if (editMethodName === "editFinal") {
      this.sceneController.updateHoverState();
    }
  }

  async _updateSelectionInfo() {
    if (!this.infoForm.container.offsetParent) {
      // If the info form is not visible, do nothing
      return;
    }
    const varGlyphController =
      await this.sceneController.sceneModel.getSelectedVariableGlyphController();
    const positionedGlyph =
      this.sceneController.sceneModel.getSelectedPositionedGlyph();
    const glyphController = positionedGlyph?.glyph;
    const instance = glyphController?.instance;
    const glyphName = glyphController?.name;
    let unicodes = this.fontController.glyphMap?.[glyphName] || [];
    if (positionedGlyph?.isUndefined && positionedGlyph.character && !unicodes.length) {
      // Glyph does not yet exist in the font, so varGlyphController is undefined,
      // But we can grab the unicode from positionedGlyph.character anyway.
      unicodes = [positionedGlyph.character.codePointAt(0)];
    }
    const unicodesStr = unicodes
      .map((code) => makeUPlusStringFromCodePoint(code))
      .join(" ");
    const canEdit = glyphController?.canEdit;

    const formContents = [];
    if (glyphName) {
      formContents.push({
        key: "glyphName",
        type: "text",
        label: "Glyph name",
        value: glyphName,
      });
      formContents.push({
        key: "unicodes",
        type: "text",
        label: "Unicode",
        value: unicodesStr,
      });
      formContents.push({
        type: "edit-number",
        key: '["xAdvance"]',
        label: "Advance width",
        value: instance.xAdvance,
        disabled: !canEdit,
      });
    }
    const { component: componentIndices } = parseSelection(
      this.sceneController.selection
    );

    for (const index of componentIndices || []) {
      const component = instance.components[index];
      if (!component) {
        // Invalid selection
        continue;
      }
      const componentKey = (...path) => JSON.stringify(["components", index, ...path]);

      formContents.push({ type: "divider" });
      formContents.push({ type: "header", label: `Component #${index}` });
      formContents.push({
        type: "edit-text",
        key: componentKey("name"),
        label: "Base glyph",
        value: component.name,
      });
      formContents.push({ type: "header", label: "Transformation" });

      for (const key of [
        "translateX",
        "translateY",
        "rotation",
        "scaleX",
        "scaleY",
        "skewX",
        "skewY",
        "tCenterX",
        "tCenterY",
      ]) {
        const value = component.transformation[key];
        formContents.push({
          type: "edit-number",
          key: componentKey("transformation", key),
          label: key,
          value: value,
          disabled: !canEdit,
        });
      }
      const baseGlyph = await this.fontController.getGlyph(component.name);
      if (baseGlyph && component.location) {
        const locationItems = [];
        const axes = Object.fromEntries(
          baseGlyph.axes.map((axis) => [axis.name, axis])
        );
        // Add global axes, if in location and not in baseGlyph.axes
        // TODO: this needs more thinking, as the axes of *nested* components
        // may also be of interest. Also: we need to be able to *add* such a value
        // to component.location.
        for (const axis of this.fontController.globalAxes) {
          if (axis.name in component.location && !(axis.name in axes)) {
            axes[axis.name] = axis;
          }
        }
        for (const axis of Object.values(axes)) {
          let value = component.location[axis.name];
          if (value === undefined) {
            value = axis.defaultValue;
          }
          locationItems.push({
            type: "edit-number-slider",
            key: componentKey("location", axis.name),
            label: axis.name,
            value: value,
            minValue: axis.minValue,
            maxValue: axis.maxValue,
            disabled: !canEdit,
          });
        }
        if (locationItems.length) {
          formContents.push({ type: "header", label: "Location" });
          formContents.push(...locationItems);
        }
      }
    }
    if (!formContents.length) {
      this.infoForm.setFieldDescriptions([{ type: "text", value: "(No selection)" }]);
    } else {
      this.infoForm.setFieldDescriptions(formContents);
      await this._setupSelectionInfoHandlers(glyphName);
    }
  }

  async _setupSelectionInfoHandlers(glyphName) {
    this.infoForm.onFieldChange = async (fieldKey, value, valueStream) => {
      const changePath = JSON.parse(fieldKey);
      await this.sceneController.editInstance(
        async (sendIncrementalChange, instance) => {
          let changes;

          if (valueStream) {
            // Continuous changes (eg. slider drag)
            const orgValue = getNestedValue(instance, changePath);
            for await (const value of valueStream) {
              if (orgValue !== undefined) {
                setNestedValue(instance, changePath, orgValue); // Ensure getting the correct undo change
              } else {
                deleteNestedValue(instance, changePath);
              }
              changes = recordChanges(instance, (instance) => {
                setNestedValue(instance, changePath, value);
              });
              await sendIncrementalChange(changes.change, true); // true: "may drop"
            }
          } else {
            // Simple, atomic change
            changes = recordChanges(instance, (instance) => {
              setNestedValue(instance, changePath, value);
            });
          }

          const plen = changePath.length;
          const undoLabel =
            plen == 1
              ? `${changePath[plen - 1]}`
              : `${changePath[plen - 2]}.${changePath[plen - 1]}`;
          return {
            changes: changes,
            undoLabel: undoLabel,
            broadcast: true,
          };
        },
        this
      );
    };
  }

  setAutoViewBox() {
    if (!this.autoViewBox) {
      return;
    }
    let bounds = this.sceneController.getSceneBounds();
    if (!bounds) {
      return;
    }
    bounds = rectAddMargin(bounds, 0.1);
    this.canvasController.setViewBox(bounds);
  }

  zoomIn() {
    this._zoom(1 / Math.sqrt(2));
  }

  zoomOut() {
    this._zoom(Math.sqrt(2));
  }

  _zoom(factor) {
    let viewBox = this.canvasController.getViewBox();
    const selBox = this.sceneController.getSelectionBox();
    const center = rectCenter(selBox || viewBox);
    viewBox = rectScaleAroundCenter(viewBox, factor, center);

    const adjustFactor =
      this.canvasController.getProposedViewBoxClampAdjustment(viewBox);
    if (adjustFactor !== 1) {
      // The viewBox is too large or too small
      if (Math.abs(adjustFactor * factor - 1) < 0.00000001) {
        // Already at min/max magnification
        return;
      }
      viewBox = rectScaleAroundCenter(viewBox, adjustFactor, center);
    }

    this.animateToViewBox(viewBox);
  }

  zoomFit() {
    let viewBox = this.sceneController.getSelectionBox();
    if (viewBox) {
      let size = rectSize(viewBox);
      if (size.width < 4 && size.height < 4) {
        const center = rectCenter(viewBox);
        viewBox = centeredRect(center.x, center.y, 10, 10);
      } else {
        viewBox = rectAddMargin(viewBox, 0.1);
      }
      this.animateToViewBox(viewBox);
    }
  }

  animateToViewBox(viewBox) {
    const startViewBox = this.canvasController.getViewBox();
    const deltaViewBox = subItemwise(viewBox, startViewBox);
    let start;
    const duration = 200;

    const animate = (timestamp) => {
      if (start === undefined) {
        start = timestamp;
      }
      let t = (timestamp - start) / duration;
      if (t > 1.0) {
        t = 1.0;
      }
      const animatingViewBox = addItemwise(
        startViewBox,
        mulScalar(deltaViewBox, easeOutQuad(t))
      );
      if (t < 1.0) {
        this.canvasController.setViewBox(animatingViewBox);
        requestAnimationFrame(animate);
      } else {
        this.canvasController.setViewBox(viewBox);
        this.updateWindowLocation();
      }
    };
    requestAnimationFrame(animate);
  }

  async handleRemoteClose(event) {
    this._reconnectDialogResult = dialog(
      "Connection closed",
      "The connection to the server closed unexpectedly.",
      [{ title: "Reconnect", resultValue: "ok" }]
    );
    const result = await this._reconnectDialogResult;
    delete this._reconnectDialogResult;

    if (!result && location.hostname === "localhost") {
      // The dialog was cancelled by the "wake" event handler
      // Dubious assumption:
      // Running from localhost most likely means were looking at local data,
      // which unlikely changed while we were away. So let's not bother reloading
      // anything.
      return;
    }

    if (this.fontController.font.websocket.readyState > 1) {
      // The websocket isn't currently working, let's try to do a page reload
      location.reload();
      return;
    }

    // Reload only the data, not the UI (the page)
    const reloadPattern = { glyphs: {} };
    const glyphReloadPattern = reloadPattern.glyphs;
    for (const glyphName of this.fontController.getCachedGlyphNames()) {
      glyphReloadPattern[glyphName] = null;
    }
    // TODO: fix reloadData so we can do this:
    //   reloadPattern["glyphMap"] = null; // etc.
    // so we won't have to re-initialize the font controller to reload
    // all non-glyph data:
    await this.fontController.initialize();
    await this.reloadData(reloadPattern);
  }

  async handleRemoteError(event) {
    console.log("remote error", event);
    await dialog(
      "Connection problem",
      `There was a problem with the connection to the server.
      See the JavaScript Console for details.`,
      [{ title: "Reconnect", resultValue: "ok" }]
    );
    location.reload();
  }
}

function rectAddMargin(rect, relativeMargin) {
  const size = rectSize(rect);
  const inset =
    size.width > size.height
      ? size.width * relativeMargin
      : size.height * relativeMargin;
  return insetRect(rect, -inset, -inset);
}

function rectScaleAroundCenter(rect, scaleFactor, center) {
  rect = offsetRect(rect, -center.x, -center.y);
  rect = scaleRect(rect, scaleFactor);
  rect = offsetRect(rect, center.x, center.y);
  return rect;
}

// utils, should perhaps move to utils.js

async function glyphLinesFromText(
  text,
  characterMap,
  glyphMap,
  getSuggestedGlyphNameFunc,
  getUnicodeFromGlyphNameFunc
) {
  const glyphLines = [];
  for (const line of text.split(/\r?\n/)) {
    glyphLines.push(
      await glyphNamesFromText(
        line,
        characterMap,
        glyphMap,
        getSuggestedGlyphNameFunc,
        getUnicodeFromGlyphNameFunc
      )
    );
  }
  return glyphLines;
}

const glyphNameRE = /[//\s]/g;

async function glyphNamesFromText(
  text,
  characterMap,
  glyphMap,
  getSuggestedGlyphNameFunc,
  getUnicodeFromGlyphNameFunc
) {
  const glyphNames = [];
  for (let i = 0; i < text.length; i++) {
    let glyphName;
    let char = text[i];
    if (char == "/") {
      i++;
      if (text[i] == "/") {
        glyphName = characterMap[char.charCodeAt(0)];
      } else {
        glyphNameRE.lastIndex = i;
        glyphNameRE.test(text);
        let j = glyphNameRE.lastIndex;
        if (j == 0) {
          glyphName = text.slice(i);
          i = text.length - 1;
        } else {
          j--;
          glyphName = text.slice(i, j);
          if (text[j] == "/") {
            i = j - 1;
          } else {
            i = j;
          }
        }
        char = undefined;
        for (const codePoint of glyphMap[glyphName] || []) {
          if (characterMap[codePoint] === glyphName) {
            char = String.fromCodePoint(codePoint);
            break;
          }
        }
        if (!char && !glyphMap[glyphName]) {
          // Glyph doesn't exist in the font, try to find a unicode value
          const codePoint = await getUnicodeFromGlyphNameFunc(glyphName);
          if (codePoint) {
            char = String.fromCodePoint(codePoint);
          }
        }
      }
    } else {
      const charCode = text.codePointAt(i);
      glyphName = characterMap[charCode];
      if (charCode >= 0x10000) {
        i++;
      }
      char = String.fromCodePoint(charCode);
    }
    if (glyphName !== "") {
      let isUndefined = false;
      if (!glyphName && char) {
        glyphName = await getSuggestedGlyphNameFunc(char.codePointAt(0));
        isUndefined = true;
      }
      glyphNames.push({
        character: char,
        glyphName: glyphName,
        isUndefined: isUndefined,
      });
    }
  }
  return glyphNames;
}

function textFromGlyphLines(glyphLines) {
  const textLines = [];
  for (const glyphLine of glyphLines) {
    let textLine = "";
    for (let i = 0; i < glyphLine.length; i++) {
      const glyphInfo = glyphLine[i];
      if (glyphInfo.character) {
        textLine += glyphInfo.character;
      } else {
        textLine += "/" + glyphInfo.glyphName;
        if (glyphLine[i + 1]?.character) {
          textLine += " ";
        }
      }
    }
    textLines.push(textLine);
  }
  return textLines.join("\n");
}

function clearSearchParams(searchParams) {
  for (const key of Array.from(searchParams.keys())) {
    searchParams.delete(key);
  }
}

function getNestedValue(subject, path) {
  for (const pathElement of path) {
    if (subject === undefined) {
      throw new Error(`assert -- invalid change path: ${path}`);
    }
    subject = subject[pathElement];
  }
  return subject;
}

function setNestedValue(subject, path, value) {
  const key = path.slice(-1)[0];
  path = path.slice(0, -1);
  subject = getNestedValue(subject, path);
  subject[key] = value;
}

function deleteNestedValue(subject, path) {
  const key = path.slice(-1)[0];
  path = path.slice(0, -1);
  subject = getNestedValue(subject, path);
  delete subject[key];
}

function isTypeableInput(element) {
  element = findNestedActiveElement(element);

  if (element.contentEditable === "true") {
    return true;
  }
  if (element.tagName.toLowerCase() === "textarea") {
    return true;
  }
  if (element.tagName.toLowerCase() === "input" && element.type !== "range") {
    return true;
  }
  return false;
}

function findNestedActiveElement(element) {
  // If the element element is part of a Web Component's Shadow DOM, take
  // *its* active element, recursively.
  return element.shadowRoot && element.shadowRoot.activeElement
    ? findNestedActiveElement(element.shadowRoot.activeElement)
    : element;
}

function easeOutQuad(t) {
  return 1 - (1 - t) ** 2;
}

function matchEvent(handlerDef, event) {
  for (const prop of ["ctrlKey", "shiftKey", "altKey", "repeat"]) {
    if (handlerDef[prop] !== undefined && handlerDef[prop] !== event[prop]) {
      return false;
    }
  }
  return true;
}

function makeDisplayPath(pathItems) {
  const displayPathItems = !pathItems[0].includes(":")
    ? ["", ...pathItems]
    : [...pathItems];
  let displayPath = displayPathItems.join("/");
  while (displayPathItems.length > 2 && displayPath.length > 60) {
    displayPathItems.splice(1, 1);
    displayPath = [displayPathItems[0], "...", ...displayPathItems.slice(1)].join("/");
  }
  return displayPath;
}

function newVisualizationLayersSettings(visualizationLayers) {
  const settings = [];
  for (const definition of visualizationLayers.definitions) {
    if (!definition.userSwitchable) {
      continue;
    }
    if (!(definition.identifier in settings)) {
      settings[definition.identifier] = !!definition.defaultOn;
    }
  }
  const controller = new ObservableController(settings);
  controller.synchronizeWithLocalStorage("fontra-editor-visualization-layers.");
  for (const [key, onOff] of Object.entries(controller.model)) {
    visualizationLayers.toggle(key, onOff);
  }
  return controller;
}

function mapAxesFromUserSpaceToDesignspace(axes) {
  return axes.map((axis) => {
    const newAxis = { ...axis };
    if (axis.mapping) {
      for (const prop of ["minValue", "defaultValue", "maxValue"]) {
        newAxis[prop] = piecewiseLinearMap(
          axis[prop],
          Object.fromEntries(axis.mapping)
        );
      }
    }
    return newAxis;
  });
}

function* labeledTextInput(label, controller, key, options) {
  yield html.label({ for: key, style: "text-align: right;" }, [label]);

  const inputElement = html.input({
    type: "text",
    id: key,
    value: controller.model[key],
    oninput: () => (controller.model[key] = inputElement.value),
  });

  controller.addKeyListener(key, (key, newValue) => (inputElement.value = newValue));

  if (options && options.placeholderKey) {
    inputElement.placeholder = controller.model[options.placeholderKey];
    controller.addKeyListener(
      options.placeholderKey,
      (key, newValue) => (inputElement.placeholder = newValue)
    );
  }

  yield inputElement;
}
