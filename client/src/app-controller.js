import { CanvasController } from "./canvas-controller.js";
import { SceneController } from "./scene-controller.js"
import { centeredRect, normalizeRect } from "./rectangle.js";
import { isEqualSet, isSuperset, union, symmetricDifference } from "./set-ops.js";
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


const MINIMAL_DRAG_DISTANCE = 10;


class RectSelectTracker {
  constructor(sceneController, event) {
    this.sceneController = sceneController;
    this.initialX = event.pageX;
    this.initialY = event.pageY;
    this.initialPoint = sceneController.localPoint(event);
    this.currentSelection = this.sceneController.selection;
    this.didStart = false;
  }

  handleMouseMove(event) {
    const x = event.pageX;
    const y = event.pageY;
    if (
      Math.abs(this.initialX - x) > MINIMAL_DRAG_DISTANCE ||
      Math.abs(this.initialX - x) > MINIMAL_DRAG_DISTANCE
    ) {
      this.didStart = true;
    }
    if (!this.didStart) {
      return;
    }
    const currentPoint = this.sceneController.localPoint(event);
    const selRect = normalizeRect({
      "xMin": this.initialPoint.x,
      "yMin": this.initialPoint.y,
      "xMax": currentPoint.x,
      "yMax": currentPoint.y,
    });
    const selection = this.sceneController.selectionAtRect(selRect);
    this.sceneController.selectionRect = selRect;

    if (event.shiftKey) {
      this.sceneController.selection = symmetricDifference(this.currentSelection, selection);
    } else {
      this.sceneController.selection = selection;
    }
  }

  handleMouseUp(event) {
    this.sceneController.selectionRect = undefined;
    delete this.currentSelection;
  }

}


class MouseTracker {
  constructor(sceneController) {
    this.sceneController = sceneController;
    this.inDrag = false;
  }

  handleMouseDown(event) {
    if (!this.sceneController.canSelect()) {
      return;
    }
    this.inDrag = true;
    const point = this.sceneController.localPoint(event);
    const size = this.sceneController.mouseClickMargin
    const selection = this.sceneController.selectionAtPoint(point, size);
    let initiateDrag = false;
    let initiateRectSelect = false;

    if (selection.size > 0) {
      if (event.shiftKey) {
        this.sceneController.selection = symmetricDifference(this.sceneController.selection, selection);
        if (isSuperset(this.sceneController.selection, selection)) {
          initiateDrag = true;
        }
      } else if (isSuperset(this.sceneController.selection, selection)) {
        initiateDrag = true;
      } else {
        this.sceneController.selection = selection;
        initiateDrag = true;
      }
    } else {
      if (!event.shiftKey) {
        this.sceneController.selection = selection;
      }
      initiateRectSelect = true;
    }

    if (initiateRectSelect) {
      this.subTracker = new RectSelectTracker(this.sceneController, event);
    } else if (initiateDrag) {
      console.log("let's drag stuff", initiateDrag);
    }

    this.sceneController.hoverSelection = new Set();
  }

  handleMouseMove(event) {
    const point = this.sceneController.localPoint(event);
    const size = this.sceneController.mouseClickMargin;
    if (!this.inDrag) {
      const selRect = centeredRect(point.x, point.y, size);
      const selection = this.sceneController.selectionAtPoint(point, size);
      if (!lenientIsEqualSet(selection, this.sceneController.hoverSelection)) {
        this.sceneController.hoverSelection = selection;
      }
    } else if (this.subTracker !== undefined) {
      this.subTracker.handleMouseMove(event);
    }
  }

  handleMouseUp(event) {
    const point = this.sceneController.localPoint(event);

    if (this.subTracker !== undefined) {
      this.subTracker.handleMouseUp(event);
      delete this.subTracker;
    }

    this.inDrag = false;
  }

}


export class AppController {
  constructor(font) {
    this.font = font;
    const canvas = document.querySelector("#edit-canvas");

    const drawingParameters = this.isThemeDark ? drawingParametersDark : drawingParametersLight;
    const canvasController = new CanvasController(canvas, drawingParameters);

    this.sceneController = new SceneController(canvasController, font)
    this.mouseTracker = new MouseTracker(this.sceneController);

    canvas.addEventListener("mousemove", event => this.mouseTracker.handleMouseMove(event));
    canvas.addEventListener("mousedown", event => this.mouseTracker.handleMouseDown(event));
    canvas.addEventListener("mouseup", event => this.mouseTracker.handleMouseUp(event));

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
    console.log("theme changed?", event);
    console.log("is dark?", isDark, this.isThemeDark);
      // e => e.matches && activateDarkMode() // listener
    const drawingParameters = this.isThemeDark ? drawingParametersDark : drawingParametersLight;
    this.sceneController.setDrawingParameters(drawingParameters);
  }

  get isThemeDark() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
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


function lenientIsEqualSet(set1, set2) {
  if (set1 === set2) {
    // same object, or both undefined
    return true;
  }
  if (set1 && set2 && isEqualSet(set1, set2)) {
    return true;
  }
  return false;
}


function encodeGlyphName(glyphName) {
  // encode a glyph name as base64 minus padding, so it can be used
  // as a query selector
  return window.btoa(glyphName).replaceAll("=", "");
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
