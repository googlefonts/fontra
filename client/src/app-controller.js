import { CanvasController } from "./canvas-controller.js";
import { SceneController } from "./scene-controller.js"
import * as sceneDraw from "./scene-draw-funcs.js";
import { SceneModel } from "./scene-model.js";
import { SceneView } from "./scene-view.js"
import { List } from "./ui-list.js";
import { Sliders } from "./ui-sliders.js";


const drawingParametersLight = {
  glyphFillColor: "#000",
  hoveredGlyphStrokeColor: "#AAA",
  nodeFillColor: "#CCC",
  selectedNodeFillColor: "#000",
  hoveredNodeStrokeColor: "#CCC",
  handleColor: "#CCC",
  pathStrokeColor: "#000",
  componentFillColor: "#AAA",
  selectedComponentFillColor: "#666",
  hoveredComponentStrokeColor: "#CCC",
  cornerNodeSize: 8,
  smoothNodeSize: 8,
  handleNodeSize: 6.5,
  hoveredNodeLineWidth: 1,
  handleLineWidth: 1,
  pathLineWidth: 1,
  rectSelectLineWidth: 1,
  rectSelectLineDash: [10, 10],
}


const drawingParametersDark = {
  ...drawingParametersLight,
  glyphFillColor: "#FFF",
  hoveredGlyphStrokeColor: "#AAA",
  nodeFillColor: "#BBB",
  selectedNodeFillColor: "#FFF",
  hoveredNodeStrokeColor: "#BBB",
  handleColor: "#777",
  pathStrokeColor: "#FFF",
  componentFillColor: "#777",
  selectedComponentFillColor: "#CCC",
  hoveredComponentStrokeColor: "#555",
}


export class AppController {

  constructor(font) {
    this.font = font;
    const canvas = document.querySelector("#edit-canvas");

    const canvasController = new CanvasController(canvas, this.drawingParameters);
    this.canvasController = canvasController;
    // We need to do isPointInPath without having a context, we'll pass a bound method
    const isPointInPath = canvasController.context.isPointInPath.bind(canvasController.context);

    const sceneModel = new SceneModel(font, isPointInPath);
    const drawFuncs = [
      sceneDraw.drawMultiGlyphsLayer,
      sceneDraw.drawSelectedGlyphLayer,
      sceneDraw.drawComponentsLayer,
      sceneDraw.drawComponentSelectionLayer,
      sceneDraw.drawHandlesLayer,
      sceneDraw.drawNodesLayer,
      sceneDraw.drawPathSelectionLayer,
      sceneDraw.drawPathLayer,
      sceneDraw.drawRectangleSelectionLayer,
    ]
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
      this.sourcesList.setItems(await this.sceneController.getSourcesInfo());
      this.sourcesList.setSelectedItemIndex(await this.sceneController.getSelectedSource());
      await this.updateSlidersAndSources();
    });
    this.sceneController.addEventListener("doubleClickedComponents", async event => {
      this.doubleClickedComponentsCallback(event)
    });
    // this.sceneController.addEventListener("glyphIsChanging", event => {
    //   console.log("glyphIsChanging", event.detail);
    // });
    // this.sceneController.addEventListener("glyphDidChange", event => {
    //   console.log("glyphDidChange", event.detail);
    // });

    this.initOverlayItems(canvas);
    this.initMiniConsole();

    window.matchMedia("(prefers-color-scheme: dark)").addListener(event => this.themeChanged(event));

    canvas.addEventListener("keydown", event => this.spaceKeyDownHandler(event));
    canvas.addEventListener("keyup", event => this.spaceKeyUpHandler(event));
  }

  async start() {
    await this.initGlyphNames();
    await this.initSliders();
    this.initSourcesList();
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
    const reversedCmap = await this.font.reversedCmap;
    this.glyphsListItems = [];
    for (const glyphName in reversedCmap) {
      this.glyphsListItems.push({"glyphName": glyphName, "unicodes": reversedCmap[glyphName]});
    }
    this.glyphsListItems.sort(glyphItemSortFunc);
    this.glyphNamesList.setItems(this.glyphsListItems);
  }

  async initSliders() {
    this.sliders = new Sliders("axis-sliders", await this.sceneController.getAxisInfo());
    this.sliders.addEventListener("slidersChanged", scheduleCalls(async event => {
      const location = {...this.sceneController.getLocation(), ...event.detail.values};
      await this.sceneController.setLocation(location);
      this.sourcesList.setSelectedItemIndex(await this.sceneController.getSelectedSource());
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
    });
  }

  initOverlayItems(canvas) {
    // The following execCommand seems to make empty lines behave a bit better
    document.execCommand("defaultParagraphSeparator", false, "br");

    const overlayItems = Array.from(document.querySelectorAll(".overlay-item"));
    const textEntryElement = document.querySelector("#text-entry");

    const collapseAll = () => {
      for (const item of overlayItems) {
        item.classList.remove("overlay-item-expanded");
      }
    }

    const collapseOnEscapeKey = event => {
      if (event.key === "Escape") {
        collapseAll();
      }
    }

    textEntryElement.oninput = async event => this.textFieldChangedCallback(event.target);

    for (const item of overlayItems) {
      item.onkeydown = event => collapseOnEscapeKey(event);
      item.onclick = event => {
        if (overlayItems.indexOf(event.target) == -1) {
          return;
        }
        for (const item of overlayItems) {
          item.classList.toggle("overlay-item-expanded", item === event.target);
          if (item === event.target && item.id === "text-entry-overlay") {
            textEntryElement.focus();
          }
        }
      };
    }

    canvas.addEventListener("mousedown", event => collapseAll());
    window.addEventListener("keydown", event => collapseOnEscapeKey(event));
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
    this.sceneController.setDrawingParameters(this.drawingParameters);
  }

  get isThemeDark() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  get drawingParameters() {
    return this.isThemeDark ? drawingParametersDark : drawingParametersLight;
  }

  async glyphSearchFieldChanged(value) {
    const filteredGlyphItems = this.glyphsListItems.filter(item => glyphFilterFunc(item, value));
    const selectedItem = this.glyphNamesList.getSelectedItem();
    this.glyphNamesList.setItems(filteredGlyphItems);
    this.glyphNamesList.setSelectedItem(selectedItem);
  }

  async glyphNameChangedCallback(glyphName) {
    const codePoint = await this.font.codePointForGlyph(glyphName);
    const glyphInfo = {"glyphName": glyphName};
    if (codePoint !== undefined) {
      glyphInfo["character"] = getCharFromUnicode(codePoint);
    }
    const glyphLines = [[glyphInfo]];
    await this.sceneController.setGlyphLines(glyphLines);
    this.updateTextEntryFromGlyphLines();
    await this.updateSlidersAndSources();
  }

  updateTextEntryFromGlyphLines() {
    const textEntryElement = document.querySelector("#text-entry");
    textEntryElement.innerText = textFromGlyphLines(this.sceneController.getGlyphLines());
  }

  async textFieldChangedCallback(element) {
    const cmap = await this.font.cmap;
    const reversedCmap = await this.font.reversedCmap;
    const glyphLines = glyphLinesFromText(element.innerText, cmap, reversedCmap);
    await this.sceneController.setGlyphLines(glyphLines);
    await this.updateSlidersAndSources();
  }

  async updateSlidersAndSources() {
    const axisInfo = await this.sceneController.getAxisInfo();
    const numGlobalAxes = (await this.font.globalAxes).length;
    if (numGlobalAxes && axisInfo.length != numGlobalAxes) {
      axisInfo.splice(numGlobalAxes, 0, {"isDivider": true});
    }
    this.sliders.setSliderDescriptions(axisInfo);
    this.sliders.values = this.sceneController.getLocation();
    this.sourcesList.setItems(await this.sceneController.getSourcesInfo());
  }

  async doubleClickedComponentsCallback(event) {
    const glyphInfos = [];
    for (const glyphName of this.sceneController.doubleClickedComponentNames) {
      const glyphInfo = {"glyphName": glyphName};
      const codePoint = await this.font.codePointForGlyph(glyphName);
      if (codePoint !== undefined) {
        glyphInfo["character"] = getCharFromUnicode(codePoint);
      }
      glyphInfos.push(glyphInfo);
    }
    const selectedGlyphInfo = this.sceneController.getSelectedGlyphIndex();
    const glyphLines = this.sceneController.getGlyphLines();
    glyphLines[selectedGlyphInfo.lineIndex].splice(selectedGlyphInfo.glyphIndex + 1, 0, ...glyphInfos);
    await this.sceneController.setGlyphLines(glyphLines);
    this.updateTextEntryFromGlyphLines();
    await this.updateSlidersAndSources();
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


function glyphFilterFunc(item, searchString) {
  if (item.glyphName.indexOf(searchString) >= 0) {
    return true;
  }
  if (item.unicodes[0] !== undefined) {
    const char = String.fromCodePoint(item.unicodes[0]);
    if (searchString.indexOf(char) >= 0) {
      return true;
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


function glyphLinesFromText(text, cmap, reversedCmap) {
  const glyphLines = [];
  for (const line of splitLines(text)) {
    glyphLines.push(glyphNamesFromText(line, cmap, reversedCmap));
  }
  return glyphLines;
}


const glyphNameRE = /[//\s]/g;

function glyphNamesFromText(text, cmap, reversedCmap) {
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
        for (const codePoint of reversedCmap[glyphName] || []) {
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


function scheduleCalls(func, timeout = 0) {
  // Schedule calls to func with a timer. If a previously scheduled call
  // has not yet run, cancel it and let the new one override it.
  // Returns a wrapped function that should be called instead of func.
  // This is useful for calls triggered by events that can supersede
  // previous calls; it avoids scheduling many redundant tasks.
  let timeoutID = null;
  return (...args) => {
    if (timeoutID !== null) {
      clearTimeout(timeoutID);
    }
    timeoutID = setTimeout(() => {
      timeoutID = null;
      func(...args);
    }, timeout);
  };
}
