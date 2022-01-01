import { CanvasController } from "./canvas-controller.js";
import { SceneController } from "./scene-controller.js"
import {
  drawComponentsLayer,
  drawHandlesLayer,
  drawPathLayer,
  drawNodesLayer,
  drawSelectionLayer,
  drawHoverLayer,
  drawRectangleSelectionLayer,
} from "./scene-draw-funcs.js";
import { SceneModel } from "./scene-model.js";
import { SceneView } from "./scene-view.js"
import { List } from "./ui-list.js";


const drawingParametersLight = {
  nodeFillColor: "#CCC",
  nodeSize: 8,
  handleColor: "#CCC",
  handleLineWidth: 1,
  selection: {
    nodeSize: 10,
    nodeColor: "#000",
    nodeLineWidth: 2,
    componentFillColor: "#000"
  },
  hover: {
    nodeSize: 10,
    nodeColor: "#444",
    nodeLineWidth: 2,
    componentFillColor: "#444"
  },
  pathStrokeColor: "#000",
  pathLineWidth: 1,
  componentFillColor: "#222",
  rectSelectLineWidth: 1,
  rectSelectLineDash: [10, 10],
}


const drawingParametersDark = {
  nodeFillColor: "#777",
  nodeSize: 8,
  handleColor: "#777",
  handleLineWidth: 1,
  selection: {
    nodeSize: 10,
    nodeColor: "#FFF",
    nodeLineWidth: 2,
    componentFillColor: "#FFF"
  },
  hover: {
    nodeSize: 10,
    nodeColor: "#DDD",
    nodeLineWidth: 2,
    componentFillColor: "#DDD"
  },
  pathStrokeColor: "#FFF",
  pathLineWidth: 1,
  componentFillColor: "#CCC",
  rectSelectLineWidth: 1,
  rectSelectLineDash: [10, 10],
}


export class AppController {
  constructor(font) {
    this.font = font;
    const canvas = document.querySelector("#edit-canvas");

    const canvasController = new CanvasController(canvas, this.drawingParameters);
    // We need to do isPointInPath without having a context, we'll pass a bound method
    const isPointInPath = canvasController.context.isPointInPath.bind(canvasController.context);

    const sceneModel = new SceneModel(font, isPointInPath);
    const sceneView = new SceneView();
    const drawFuncs = [
      drawComponentsLayer,
      drawHandlesLayer,
      drawNodesLayer,
      drawPathLayer,
      drawSelectionLayer,
      drawHoverLayer,
      drawRectangleSelectionLayer,
    ]
    sceneView.subviews = drawFuncs.map(
      drawFunc => new SceneView(sceneModel, drawFunc)
    );
    canvasController.sceneView = sceneView;

    this.sceneController = new SceneController(sceneModel, canvasController)

    window.matchMedia("(prefers-color-scheme: dark)").addListener(event => this.themeChanged(event));
  }

  async start() {
    await this.initGlyphNames();
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
    this.reversedCmap = await this.font.getReversedCmap();
    this.glyphsListItems = [];
    for (const glyphName in this.reversedCmap) {
      this.glyphsListItems.push({"glyphName": glyphName, "unicodes": this.reversedCmap[glyphName]});
    }
    this.glyphsListItems.sort(glyphItemSortFunc);
    this.glyphNamesList.setItems(this.glyphsListItems);
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

  async glyphSeachFieldChanged(value) {
    const filteredGlyphItems = this.glyphsListItems.filter(item => glyphFilterFunc(item, value));
    const selectedItem = this.glyphNamesList.getSelectedItem();
    this.glyphNamesList.setItems(filteredGlyphItems);
    this.glyphNamesList.setSelectedItem(selectedItem);
  }

  async glyphNameChangedCallback(glyphName) {
    const didSetGlyph = await this.sceneController.setSelectedGlyph(glyphName);
    if (!didSetGlyph) {
      return;
    }
    // Rebuild axis sliders
    const axisSliders = document.querySelector("#axis-sliders");
    axisSliders.innerHTML = "";  // Delete previous sliders
    for (const axis of this.sceneController.getAxisInfo()) {
      const label = document.createElement("label");
      const slider = document.createElement("input");
      label.className = "slider-label";
      slider.type = "range";
      slider.step = "any";
      slider.class = "slider";
      slider.min = axis.minValue;
      slider.max = axis.maxValue;
      slider.value = axis.defaultValue;
      {
        const axisName = axis.name;
        slider.oninput = event => this.sceneController.setAxisValue(axisName, event.target.value);
      }
      label.appendChild(slider);
      label.append(axis.name);
      axisSliders.appendChild(label);
    }
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
