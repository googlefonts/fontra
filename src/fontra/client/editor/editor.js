import { CanvasController } from "../core/canvas-controller.js";
import { matchChange } from "../core/changes.js";
import { FontController } from "../core/font-controller.js";
import { loaderSpinner } from "../core/loader-spinner.js";
import { insetRect, rectFromArray, rectToArray } from "../core/rectangle.js";
import { getRemoteProxy } from "../core/remote.js";
import { SceneView } from "../core/scene-view.js"
import { Form } from "../core/ui-form.js";
import { List } from "../core/ui-list.js";
import { Sliders } from "../core/ui-sliders.js";
import { hyphenatedToCamelCase, parseCookies, scheduleCalls, throttleCalls } from "../core/utils.js";
import { SceneController } from "./scene-controller.js"
import * as sceneDraw from "./scene-draw-funcs.js";
import { SceneModel } from "./scene-model.js";


const drawingParametersLight = {
  glyphFillColor: "#000",
  hoveredGlyphStrokeColor: "#BBB8",
  selectedGlyphStrokeColor: "#7778",
  nodeFillColor: "#CCC",
  selectedNodeFillColor: "#000",
  hoveredNodeStrokeColor: "#CCC",
  handleColor: "#CCC",
  pathStrokeColor: "#000",
  ghostPathStrokeColor: "#0002",
  pathFillColor: "#0001",
  selectedComponentStrokeColor: "#888",
  hoveredComponentStrokeColor: "#DDD",
  cjkFrameStrokeColor: "#0004",
  cjkFrameOvershootColor: "#00BFFF26",
  cjkFrameSecondLineColor: "#A6296344",
  sidebearingBarColor: "#0004",
  cornerNodeSize: 8,
  smoothNodeSize: 8,
  handleNodeSize: 6.5,
  hoveredNodeLineWidth: 1,
  handleLineWidth: 1,
  pathLineWidth: 1,
  rectSelectLineWidth: 1,
  rectSelectLineDash: [10, 10],
  cjkFrameLineWidth: 1,
  selectedComponentLineWidth: 3,
  hoveredComponentLineWidth: 3,
  sidebearingBarExtent: 16,
}


const drawingParametersDark = {
  ...drawingParametersLight,
  glyphFillColor: "#FFF",
  hoveredGlyphStrokeColor: "#CCC8",
  selectedGlyphStrokeColor: "#FFF8",
  nodeFillColor: "#BBB",
  selectedNodeFillColor: "#FFF",
  hoveredNodeStrokeColor: "#BBB",
  handleColor: "#777",
  pathStrokeColor: "#FFF",
  ghostPathStrokeColor: "#FFF4",
  pathFillColor: "#FFF3",
  selectedComponentStrokeColor: "#BBB",
  hoveredComponentStrokeColor: "#777",
  cjkFrameStrokeColor: "#FFF6",
  cjkFrameSecondLineColor: "#A62963AA",
  sidebearingBarColor: "#FFF6",
}


export class EditorController {

  static async fromWebSocket() {
    const cookies = parseCookies(document.cookie);
    const webSocketPort = parseInt(cookies["websocket-port"]);
    const pathItems = window.location.pathname.split("/");
    // assert pathItems[0] === ""
    // assert pathItems[1] === "editor"
    // assert pathItems[2] === "-"
    const projectPath = pathItems.slice(3).join("/");
    document.title = `Fontra — ${projectPath}`;
    const protocol = window.location.protocol === "http:" ? "ws" : "wss";
    const wsURL = `${protocol}://${window.location.hostname}:${webSocketPort}/${projectPath}`;

    const remoteFontEngine = await getRemoteProxy(wsURL);
    const editorController = new EditorController(remoteFontEngine);
    remoteFontEngine.receiver = editorController;
    await editorController.start();
    return editorController;
  }

  constructor(font) {
    this.fontController = new FontController(font, {});
    this.autoViewBox = true;
    const canvas = document.querySelector("#edit-canvas");

    const canvasController = new CanvasController(canvas, this.drawingParameters);
    this.canvasController = canvasController;
    // We need to do isPointInPath without having a context, we'll pass a bound method
    const isPointInPath = canvasController.context.isPointInPath.bind(canvasController.context);

    const sceneModel = new SceneModel(this.fontController, isPointInPath);
    const drawFuncs = this.getDrawingFunctions();
    const sceneView = new SceneView();
    sceneView.subviews = drawFuncs.map(
      drawFunc => new SceneView(sceneModel, drawFunc)
    );
    canvasController.sceneView = sceneView;

    this.defaultSceneView = sceneView;
    this.cleanSceneView = new SceneView(sceneModel, sceneDraw.drawMultiGlyphsLayerClean);

    this.sceneController = new SceneController(sceneModel, canvasController)
    // TODO move event stuff out of here
    this.sceneController.addEventListener("selectedGlyphChanged", async event => {
      await this.updateSlidersAndSources();
      this.sourcesList.setSelectedItemIndex(await this.sceneController.getSelectedSource());
    });
    this.sceneController.addEventListener("doubleClickedComponents", async event => {
      this.doubleClickedComponentsCallback(event)
    });

    this.initOverlayItems(canvas);
    this.initMiniConsole();
    this.infoForm = new Form("selection-info");

    window.matchMedia("(prefers-color-scheme: dark)").addListener(event => this.themeChanged(event));

    canvas.addEventListener("keydown", event => this.spaceKeyDownHandler(event));
    canvas.addEventListener("keyup", event => this.spaceKeyUpHandler(event));

    this.enteredText = "";
    this.updateWindowLocation = scheduleCalls(event => this._updateWindowLocation(), 500);
    this.updateSelectionInfo = throttleCalls(async event => await this._updateSelectionInfo(), 100);
    canvas.addEventListener("viewBoxChanged", event => {
      if (event.detail === "canvas-size") {
        this.setAutoViewBox();
      } else {
        this.autoViewBox = false;
      }
      this.updateWindowLocation();
    });
    this.sceneController.addEventListener("selectedGlyphChanged", () => this.updateWindowLocationAndSelectionInfo());
    this.sceneController.addEventListener("selectionChanged", () => this.updateWindowLocationAndSelectionInfo());
  }

  getDrawingFunctions() {
    return [
      sceneDraw.drawMultiGlyphsLayer,
      sceneDraw.drawCJKDesignFrameLayer,
      // sceneDraw.drawSelectedBaselineLayer,
      sceneDraw.drawSidebearingsLayer,
      sceneDraw.drawGhostPathLayer,
      sceneDraw.drawPathFillLayer,
      sceneDraw.drawSelectedGlyphLayer,
      sceneDraw.drawHoveredGlyphLayer,
      sceneDraw.drawComponentSelectionLayer,
      sceneDraw.drawHandlesLayer,
      sceneDraw.drawNodesLayer,
      sceneDraw.drawPathSelectionLayer,
      sceneDraw.drawPathStrokeLayer,
      sceneDraw.drawRectangleSelectionLayer,
    ]
  }

  async start() {
    await loaderSpinner(this._start());
  }

  async _start() {
    await this.fontController.initialize();
    await this.initGlyphNames();
    await this.initSliders();
    this.initSourcesList();
    await this.setupFromWindowLocation();
  }

  async initGlyphNames() {
    const columnDescriptions = [
      {"key": "char", "width": "2em", "get": item => getCharFromUnicode(item.unicodes[0])},
      {"key": "glyphName", "width": "10em", },
      {"key": "unicode", "width": "5em", "get": item => getUniStringFromUnicode(item.unicodes[0])},
    ];
    this.glyphNamesList = new List("glyphs-list", columnDescriptions);
    this.glyphNamesList.addEventListener("listSelectionChanged", async event => {
      const list = event.detail;
      const item = list.items[list.selectedItemIndex];
      await this.glyphNameChangedCallback(item.glyphName);
    });
    const reverseCmap = this.fontController.reverseCmap;
    this.glyphsListItems = [];
    for (const glyphName in reverseCmap) {
      this.glyphsListItems.push({"glyphName": glyphName, "unicodes": reverseCmap[glyphName]});
    }
    this.glyphsListItems.sort(glyphItemSortFunc);
    this.glyphNamesList.setItems(this.glyphsListItems);
  }

  async initSliders() {
    this.sliders = new Sliders("axis-sliders", await this.sceneController.getAxisInfo());
    this.sliders.addEventListener("slidersChanged", scheduleCalls(async event => {
      await this.sceneController.setLocation(event.detail.values);
      this.sourcesList.setSelectedItemIndex(await this.sceneController.getSelectedSource());
      this.updateWindowLocationAndSelectionInfo();
    }));
  }

  initSourcesList() {
    const columnDescriptions = [
      {"key": "sourceName", "width": "14em"},
      // {"key": "sourceIndex", "width": "2em"},
    ];
    this.sourcesList = new List("sources-list", columnDescriptions);
    this.sourcesList.addEventListener("listSelectionChanged", async event => {
      await this.sceneController.setSelectedSource(event.detail.getSelectedItem().sourceIndex);
      this.sliders.values = this.sceneController.getLocation();
      this.updateWindowLocationAndSelectionInfo();
    });
  }

  initOverlayItems(canvas) {
    // The following execCommand seems to make empty lines behave a bit better
    document.execCommand("defaultParagraphSeparator", false, "br");

    const overlayItems = Array.from(document.querySelectorAll(".overlay-item"));
    this.textEntryElement = document.querySelector("#text-entry");

    const collapseAll = () => {
      for (const item of overlayItems) {
        item.classList.remove("overlay-item-expanded");
        this._callToggleOverlayItem(item.id, false);
      }
    }

    const collapseOnEscapeKey = event => {
      if (event.key === "Escape") {
        collapseAll();
      }
    }

    this.textEntryElement.oninput = async event => this.textFieldChangedCallback(event.target);

    for (const item of overlayItems) {
      item.onkeydown = event => collapseOnEscapeKey(event);
      item.onclick = event => {
        if (overlayItems.indexOf(event.target) == -1) {
          return;
        }
        for (const item of overlayItems) {
          item.classList.toggle("overlay-item-expanded", item === event.target);
          if (item === event.target && item.id === "text-entry-overlay") {
            this.textEntryElement.focus();
          }
          this._callToggleOverlayItem(item.id, item === event.target);
        }
      };
    }

    canvas.addEventListener("mousedown", event => collapseAll());
    window.addEventListener("keydown", event => collapseOnEscapeKey(event));
  }

  _callToggleOverlayItem(itemId, onOff) {
    const methodName = hyphenatedToCamelCase("toggle-" + itemId);
    this[methodName]?.call(this, onOff);
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
      this.miniConsole.innerText = args.map(
        item => {
          try {
            return typeof item == "string" ? item : JSON.stringify(item);
          } catch(error) {
            return item;
          }
        }
      ).join(" ");
      this.miniConsole.style.display = "inherit";
      clearMiniConsole();
    }
  }

  themeChanged(event) {
    const isDark = event.matches;
    this.canvasController.setDrawingParameters(this.drawingParameters);
  }

  get isThemeDark() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  get drawingParametersLight() {
    return drawingParametersLight;
  }

  get drawingParametersDark() {
    return drawingParametersDark;
  }

  get drawingParameters() {
    return this.isThemeDark ? this.drawingParametersDark : this.drawingParametersLight;
  }

  async glyphSearchFieldChanged(value) {
    const searchItems = value.split(/\s+/).filter(item => item.length);
    const filteredGlyphItems = this.glyphsListItems.filter(item => glyphFilterFunc(item, searchItems));
    const selectedItem = this.glyphNamesList.getSelectedItem();
    this.glyphNamesList.setItems(filteredGlyphItems);
    this.glyphNamesList.setSelectedItem(selectedItem);
  }

  async glyphNameChangedCallback(glyphName) {
    const codePoint = this.fontController.codePointForGlyph(glyphName);
    const glyphInfo = {"glyphName": glyphName};
    if (codePoint !== undefined) {
      glyphInfo["character"] = getCharFromUnicode(codePoint);
    }
    const selectedGlyphState = this.sceneController.getSelectedGlyphState();
    const glyphLines = this.sceneController.getGlyphLines();
    if (selectedGlyphState) {
      glyphLines[selectedGlyphState.lineIndex][selectedGlyphState.glyphIndex] = glyphInfo;
      await this.setGlyphLines(glyphLines);
      this.sceneController.setSelectedGlyphState(selectedGlyphState);
    } else {
      if (!glyphLines.length) {
        glyphLines.push([]);
      }
      const lineIndex = glyphLines.length - 1;
      glyphLines[lineIndex].push(glyphInfo);
      await this.setGlyphLines(glyphLines);
      this.sceneController.setSelectedGlyphState(
        {"lineIndex": lineIndex, "glyphIndex": glyphLines[lineIndex].length - 1, "isEditing": false}
      );
    }
    this.updateTextEntryFromGlyphLines();
    await this.updateSlidersAndSources();
    this.setAutoViewBox();
  }

  updateTextEntryFromGlyphLines() {
    this.enteredText = textFromGlyphLines(this.sceneController.getGlyphLines());
    this.textEntryElement.innerText = this.enteredText;
  }

  async textFieldChangedCallback(element) {
    this.setGlyphLinesFromText(element.innerText);
  }

  async setGlyphLines(glyphLines) {
    await loaderSpinner(this.sceneController.setGlyphLines(glyphLines));
  }

  async setGlyphLinesFromText(text) {
    this.enteredText = text;
    await this.fontController.ensureInitialized;
    const glyphLines = glyphLinesFromText(
      this.enteredText,
      this.fontController.cmap,
      this.fontController.reverseCmap,
    );
    await this.setGlyphLines(glyphLines);
    await this.updateSlidersAndSources();
    this.setAutoViewBox();
  }

  async updateSlidersAndSources() {
    const axisInfo = await this.sceneController.getAxisInfo();
    const numGlobalAxes = this.fontController.globalAxes.length;
    if (numGlobalAxes && axisInfo.length != numGlobalAxes) {
      axisInfo.splice(numGlobalAxes, 0, {"isDivider": true});
    }
    this.sliders.setSliderDescriptions(axisInfo);
    const location = this.sceneController.getLocation();
    this.sliders.values = location;
    this.sourcesList.setItems(await this.sceneController.getSourcesInfo());
    this.updateWindowLocationAndSelectionInfo();
  }

  async doubleClickedComponentsCallback(event) {
    const glyphInfos = [];
    for (const glyphName of this.sceneController.doubleClickedComponentNames) {
      const glyphInfo = {"glyphName": glyphName};
      const codePoint = this.fontController.codePointForGlyph(glyphName);
      if (codePoint !== undefined) {
        glyphInfo["character"] = getCharFromUnicode(codePoint);
      }
      glyphInfos.push(glyphInfo);
    }
    const selectedGlyphInfo = this.sceneController.getSelectedGlyphState();
    const glyphLines = this.sceneController.getGlyphLines();
    glyphLines[selectedGlyphInfo.lineIndex].splice(selectedGlyphInfo.glyphIndex + 1, 0, ...glyphInfos);
    await this.setGlyphLines(glyphLines);
    this.updateTextEntryFromGlyphLines();
    await this.updateSlidersAndSources();
    this.setAutoViewBox();
  };

  spaceKeyDownHandler(event) {
    if (event.key !== " " || event.repeat) {
      return;
    }
    this.canvasController.sceneView = this.cleanSceneView;
    this.canvasController.setNeedsUpdate();
    const overlay = document.querySelector("#overlay-layer");
    overlay.classList.add("overlay-layer-hidden");
  }

  spaceKeyUpHandler(event) {
    if (event.key != " ") {
      return;
    }
    this.canvasController.sceneView = this.defaultSceneView;
    this.canvasController.setNeedsUpdate();
    const overlay = document.querySelector("#overlay-layer");
    overlay.classList.remove("overlay-layer-hidden");
  }

  async externalChange(change) {
    await this.fontController.applyChange(change);
    await this.sceneController.sceneModel.updateScene();
    const selectedGlyphName = this.sceneController.sceneModel.getSelectedGlyphName();
    if (selectedGlyphName !== undefined && matchChange(change, ["glyphs", selectedGlyphName])) {
      this.updateSelectionInfo();
    }
    this.canvasController.setNeedsUpdate();
  }

  async reloadGlyphs(glyphNames) {
    await this.fontController.reloadGlyphs(glyphNames);
    await this.sceneController.sceneModel.updateScene();
    const selectedGlyphName = this.sceneController.sceneModel.getSelectedGlyphName();
    if (selectedGlyphName !== undefined && glyphNames.includes(selectedGlyphName)) {
      this.updateSelectionInfo();
    }
    this.canvasController.setNeedsUpdate();
  }

  async setupFromWindowLocation() {
    const url = new URL(window.location);
    let text, selectedGlyph, viewBox, selection;
    let selectedGlyphIsEditing = false;
    const location = {};
    for (const key of url.searchParams.keys()) {
      const value = url.searchParams.get(key);
      switch (key) {
        case "text":
          text = value;
          break;
        case "selectedGlyph":
          selectedGlyph = value.replaceAll("_", "/");
          break;
        case "editing":
          selectedGlyphIsEditing = value === "true";
          break;
        case "viewBox":
          viewBox = value.split("_").map(v => parseFloat(v));
          viewBox = rectFromArray(viewBox);
          break;
        case "selection":
          selection = new Set(value.replaceAll(".", "/").split("_"));
          break;
        default:
          if (key.startsWith("axis-")) {
            location[key.slice(5)] = parseFloat(value);
          }
      }
    }
    if (viewBox) {
      this.autoViewBox = false;
      this.canvasController.setViewBox(viewBox);
    }
    if (text) {
      this.textEntryElement.innerText = text;
      await this.setGlyphLinesFromText(text);
    }
    if (selectedGlyph) {
      this.sceneController.selectedGlyph = selectedGlyph;
    }
    await this.sceneController.setLocation(location);
    this.sceneController.selectedGlyphIsEditing = selectedGlyphIsEditing && !!selectedGlyph;
    this.sourcesList.setSelectedItemIndex(await this.sceneController.getSelectedSource());
    this.sliders.values = location;
    if (selection) {
      this.sceneController.selection = selection;
    }
    this.canvasController.setNeedsUpdate()
  }

  _updateWindowLocation() {
    const viewBox = this.canvasController.getViewBox();
    const viewBoxString = rectToArray(viewBox).map(v => v.toFixed(1)).join("_")

    const url = new URL(window.location);
    clearSearchParams(url.searchParams);

    url.searchParams.set("viewBox", viewBoxString);
    if (this.enteredText) {
      url.searchParams.set("text", this.enteredText);
    }
    if (this.sceneController.selectedGlyph) {
      url.searchParams.set("selectedGlyph", this.sceneController.selectedGlyph.replaceAll("/", "_"));
    }
    if (this.sceneController.selectedGlyphIsEditing) {
      url.searchParams.set("editing", "true");
    }
    for (const [name, value] of Object.entries(this.sliders.values)) {
      url.searchParams.set("axis-" + name, value.toFixed(2));
    }
    const selString = Array.from(this.sceneController.selection).join("_").replaceAll("/", ".");
    if (selString) {
      url.searchParams.set("selection", selString);
    }
    window.history.replaceState({}, "", url);
  }

  updateWindowLocationAndSelectionInfo() {
    this.updateSelectionInfo();
    this.updateWindowLocation();
  }

  toggleSelectionInfoOverlay(onOff) {
    if (onOff) {
      this.updateSelectionInfo();
    }
  }

  async _updateSelectionInfo() {
    if (!this.infoForm.container.offsetParent) {
      return;
    }
    const glyphController = this.sceneController.sceneModel.getSelectedStaticGlyphController();
    const instance = glyphController?.instance;
    const glyphName = glyphController?.name;
    const canEdit = glyphController?.canEdit;

    const formContents = [];
    if (glyphName) {
      formContents.push({"key": "glyphName", "type": "text", "label": "Glyph name", "value": glyphName});
      formContents.push({
        "type": "edit-number",
        "key": "[\"xAdvance\"]",
        "label": "Advance width",
        "value": instance.xAdvance,
        "disabled": !canEdit,
      });
    }
    const selection = Array.from(this.sceneController.selection || []);
    selection.sort(selectionCompare);

    for (const selItem of selection) {
      let [tp, index] = selItem.split("/");

      const componentKey = (...path) => JSON.stringify(["components", index, ...path]);

      if (tp === "component") {
        index = parseInt(index);
        formContents.push({"type": "divider"});
        const component = instance.components[index];
        formContents.push({"type": "header", "label": `Component #${index}`});
        formContents.push({
          "type": "edit-text",
          "key": componentKey("name"),
          "label": "Base glyph",
          "value": component.name,
        });
        formContents.push({"type": "header", "label": "Transformation"});

        for (const key of ["x", "y", "rotation", "scalex", "scaley", "tcenterx", "tcentery"]) {
          const value = component.transformation[key];
          formContents.push({
            "type": "edit-number",
            "key": componentKey("transformation", key),
            "label": key,
            "value": value,
            "disabled": !canEdit,
          });
        }
        const baseGlyph = await this.fontController.getGlyph(component.name);
        if (baseGlyph?.axes && baseGlyph.axes.length) {
          formContents.push({"type": "header", "label": "Location"});
          for (const axis of baseGlyph.axes) {
            let value = component.location[axis.name];
            if (value === undefined) {
              value = axis.defaultValue;
            }
            formContents.push({
              "type": "edit-number-slider",
              "key": componentKey("location", axis.name),
              "label": axis.name,
              "value": value,
              "minValue": axis.minValue,
              "maxValue": axis.maxValue,
              "disabled": !canEdit,
            });
          }
        }
      }
    }
    if (!formContents.length) {
      this.infoForm.setFieldDescriptions([{"type": "text", "value": "(No selection)"}]);
    } else {
      this.infoForm.setFieldDescriptions(formContents);
      await this._setupSelectionInfoHandlers(glyphName);
    }
  }

  async _setupSelectionInfoHandlers(glyphName) {
    let editContext;
    let keyString;
    let localChangePath;
    let change;
    let rollbackChange;

    const setup = async info => {
      editContext = await this.sceneController.getGlyphEditContext();
      if (!editContext) {
        console.log(`can't edit glyph '${glyphController.name}': location is not a source`);
        return false;
      }
      keyString = info.key;
      localChangePath = JSON.parse(keyString);
      rollbackChange = makeFieldChange(localChangePath, getNestedValue(editContext.instance, localChangePath));
      return true;
    };

    const breakdown = () => {
      editContext = undefined;
      keyString = undefined;
      localChangePath = undefined;
      change = undefined;
      rollbackChange = undefined;
    };

    this.infoForm.onBeginChange = async info => {
      if (!(await setup(info))) {
        return;
      }
      await editContext.editBegin();
      await editContext.editSetRollback(rollbackChange);
    };

    this.infoForm.onDoChange = async info => {
      let isAtomicEdit = (editContext === undefined);
      if (isAtomicEdit) {
        if (!(await setup(info))) {
          return;
        }
        change = makeFieldChange(localChangePath, info.value);
        await editContext.editAtomic(change, rollbackChange);
        breakdown();
      } else {
        if (keyString !== info.key) {
          throw new Error(`assert -- non-matching key ${keyString} vs. ${info.key}`);
        }
        change = makeFieldChange(localChangePath, info.value);
        await editContext.editDo(change);
      }
    };

    this.infoForm.onEndChange = async info => {
      if (!editContext) {
        return;
      }
      if (keyString !== info.key) {
        throw new Error(`assert -- non-matching key ${keyString} vs. ${info.key}`);
      }
      await editContext.editEnd(change);
      breakdown();
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
    const width = bounds.xMax - bounds.xMin;
    const height = bounds.yMax - bounds.yMin;
    const inset = width > height ? width * 0.1 : height * 0.1;
    bounds = insetRect(bounds, -inset, -inset);
    this.canvasController.setViewBox(bounds);
  }

}


function getCharFromUnicode(codePoint) {
  return codePoint !== undefined ? String.fromCodePoint(codePoint) : ""

}


function getUniStringFromUnicode(codePoint) {
  return codePoint !== undefined ? "U+" + codePoint.toString(16).toUpperCase().padStart(4, "0") : ""
}


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


// utils, should perhaps move to utils.js

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


function glyphLinesFromText(text, cmap, reverseCmap) {
  const glyphLines = [];
  for (const line of splitLines(text)) {
    glyphLines.push(glyphNamesFromText(line, cmap, reverseCmap));
  }
  return glyphLines;
}


const glyphNameRE = /[//\s]/g;

function glyphNamesFromText(text, cmap, reverseCmap) {
  const glyphNames = [];
  for (let i = 0; i < text.length; i++) {
    let glyphName;
    let char = text[i];
    if (char == "/") {
      i++;
      if (text[i] == "/") {
        glyphName = cmap[char.charCodeAt(0)];
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
        for (const codePoint of reverseCmap[glyphName] || []) {
          if (cmap[codePoint] === glyphName) {
            char = String.fromCodePoint(codePoint);
            break;
          }
        }
      }
    } else {
      glyphName = cmap[char.charCodeAt(0)];
    }
    if (glyphName !== "") {
      glyphNames.push({character: char, glyphName: glyphName});
    }
  }
  return glyphNames;
}


function splitLines(text) {
  const lines = [];
  let previousLineEmpty = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.length === 0) {
      if (previousLineEmpty) {
        // turn double empty lines into a single empty line,
        // working around a weirdness of element.innerText
        previousLineEmpty = false;
        continue;
      }
      previousLineEmpty = true;
    }
    lines.push(line);
  }
  return lines;
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


function makeFieldChange(path, value) {
  const key = path.slice(-1)[0];
  path = path.slice(0, -1);
  return {
    "p": path,
    "f": "=",
    "k": key,
    "v": value,
  };
}


function getNestedValue(subject, path) {
  for (const pathElement of path) {
    subject = subject[pathElement];
    if (subject === undefined) {
      throw new Error(`assert -- invalid change path: ${path}`);
    }
  }
  return subject;
}


function selectionCompare(a, b) {
  const [a0, a1] = a.split("/");
  const [b0, b1] = b.split("/");
  if (a0 === b0) {
    return parseInt(a1) - parseInt(b1);
  } else if (a0 < b0) {
    return -1;
  } else {
    return 1;
  }
}
