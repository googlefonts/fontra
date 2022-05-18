import { applyChange, baseChangeFunctions, consolidateChanges } from "./changes.js";
import { VariableGlyphController } from "./glyph-controller.js";
import { LRUCache } from "./lru-cache.js";
import { VariableGlyph } from "./var-glyph.js";
import { mapForward, normalizeLocation } from "./var-model.js";
import { throttleCalls } from "./utils.js";


export class FontController {

  constructor (font, location) {
    this.font = font;
    this.location = location;
    this._glyphsPromiseCache = new LRUCache(250);  // TODO: what if we need to display > 250 glyphs?
    this._editListeners = new Set();
    this.glyphUsedBy = {};  // Loaded glyphs only: this is for updating the scene
    this.glyphMadeOf = {};
    this.ensureInitialized = new Promise((resolve, reject) => {
      this._resolveInitialized = resolve;
    });
  }

  async initialize() {
    this.reverseCmap = await this.font.getReverseCmap();
    this.cmap = makeCmapFromReverseCmap(this.reverseCmap);
    this.globalAxes = await this.font.getGlobalAxes();
    this.fontLib = await this.font.getFontLib();
    this._resolveInitialized();
  }

  codePointForGlyph(glyphName) {
    const reverseCmap = this.reverseCmap;
    const cmap = this.cmap;
    for (const codePoint of reverseCmap[glyphName] || []) {
      if (cmap[codePoint] === glyphName) {
        return codePoint;
      }
    }
    return undefined;
  }

  async hasGlyph(glyphName) {
    return glyphName in this.reverseCmap;
  }

  getGlyph(glyphName) {
    let glyphPromise = this._glyphsPromiseCache.get(glyphName);
    if (glyphPromise === undefined) {
      glyphPromise = (async () => {
        if (!await this.hasGlyph(glyphName)) {
          return null;
        }
        let glyph = await this.font.getGlyph(glyphName);
        if (glyph !== null) {
          glyph = VariableGlyph.fromObject(glyph);
          glyph = new VariableGlyphController(glyph, this.globalAxes);
          this.updateGlyphDependencies(glyph);
        }
        return glyph;
      })();
      const purgedGlyphName = this._glyphsPromiseCache.put(glyphName, glyphPromise);
      // if (purgedGlyphName) {
      //   console.log("purging", purgedGlyphName);
      //   this.font.unloadGlyph(purgedGlyphName);
      // }
      // console.log("LRU size", this._glyphsPromiseCache.map.size);
    }
    return glyphPromise;
  }

  updateGlyphDependencies(glyph) {
    const glyphName = glyph.name;
    // Zap previous used-by data for this glyph, if any
    for (const componentName of this.glyphMadeOf[glyphName] || []) {
      if (this.glyphUsedBy[componentName]) {
        this.glyphUsedBy[componentName].delete(glyphName);
      }
    }
    const componentNames = glyph.getAllComponentNames();
    this.glyphMadeOf[glyphName] = componentNames;
    for (const componentName of componentNames) {
      if (!this.glyphUsedBy[componentName]) {
        this.glyphUsedBy[componentName] = new Set();
      }
      this.glyphUsedBy[componentName].add(glyphName);
    }
  }

  get location() {
    return this._location;
  }

  set location(location) {
    this._location = location;
    this._glyphInstancePromiseCache = {};
    this._loadedGlyphInstances = {};
  }

  async glyphChanged(glyphName) {
    const glyphNames = [glyphName, ...this.iterGlyphUsedBy(glyphName)]
    for (const glyphName of glyphNames) {
      delete this._glyphInstancePromiseCache[glyphName];
      delete this._loadedGlyphInstances[glyphName];
    }
    for (const glyphName of glyphNames) {
      const varGlyph = await this.getGlyph(glyphName);
      varGlyph.clearDeltasCache();
    }
  }

  isGlyphInstanceLoaded(glyphName) {
    return glyphName in this._loadedGlyphInstances;
  }

  getGlyphInstance(glyphName) {
    let glyphInstancePromise = this._glyphInstancePromiseCache[glyphName];
    if (glyphInstancePromise === undefined) {
      glyphInstancePromise = (async () => {
        if (!await this.hasGlyph(glyphName)) {
          return null;
        }
        const varGlyph = await this.getGlyph(glyphName);
        const getGlyphFunc = this.getGlyph.bind(this);
        const instanceController = await varGlyph.instantiateController(this.location, getGlyphFunc);
        this._loadedGlyphInstances[glyphName] = true;
        return instanceController;
      })();
      this._glyphInstancePromiseCache[glyphName] = glyphInstancePromise;
    }
    return glyphInstancePromise;
  }

  async getSourceIndex(glyphName) {
    const glyph = await this.getGlyph(glyphName);
    return glyph.getSourceIndex(this.location);
  }

  async subscribeLiveGlyphChanges(glyphNames) {
    this.font.subscribeLiveGlyphChanges(glyphNames);
  }

  addEditListener(listener) {
    this._editListeners.add(listener);
  }

  removeEditListener(listener) {
    this._editListeners.delete(listener);
  }

  async notifyEditListeners(editMethodName, senderID, ...args) {
    for (const listener of this._editListeners) {
      await listener(editMethodName, senderID, ...args);
    }
  }

  async getGlyphEditContext(glyphController, senderID) {
    if (!glyphController.canEdit) {
      // log warning here, or should the caller do that?
      return null;
    }

    const editContext = new GlyphEditContext(this, glyphController, senderID);
    await editContext.setup();
    return editContext;
  }

  async applyChange(change) {
    if (change.p[0] === "glyphs") {
      const glyphName = change.p[1];
      const glyphSet = {};
      const root = {"glyphs": glyphSet};
      glyphSet[glyphName] = (await this.getGlyph(glyphName)).glyph;
      applyChange(root, change, glyphChangeFunctions);
      this.glyphChanged(glyphName);
    }
  }

  *iterGlyphMadeOf(glyphName) {
    for (const dependantGlyphName of this.glyphMadeOf[glyphName] || []) {
      yield dependantGlyphName;
      for (const deeperGlyphName of this.iterGlyphMadeOf(dependantGlyphName)) {
        yield deeperGlyphName;
      }
    }
  }

  *iterGlyphUsedBy(glyphName) {
    for (const dependantGlyphName of this.glyphUsedBy[glyphName] || []) {
      yield dependantGlyphName;
      for (const deeperGlyphName of this.iterGlyphUsedBy(dependantGlyphName)) {
        yield deeperGlyphName;
      }
    }
  }

  _purgeGlyphCache(glyphName) {
    this._glyphsPromiseCache.delete(glyphName);
    delete this._glyphInstancePromiseCache[glyphName];
    delete this._loadedGlyphInstances[glyphName];
    for (const dependantName of this.glyphUsedBy[glyphName] || []) {
      this._purgeGlyphCache(dependantName);
    }
  }

  async reloadGlyphs(glyphNames) {
    for (const glyphName of glyphNames) {
      this._purgeGlyphCache(glyphName);
    }
  }

}


function makeCmapFromReverseCmap(reverseCmap) {
  const cmap = {};
  for (const [glyphName, codePoints] of Object.entries(reverseCmap)) {
    for (const codePoint of codePoints) {
      const mappedGlyphName = cmap[codePoint];
      if (mappedGlyphName !== undefined && glyphName > mappedGlyphName) {
        continue;
      }
      cmap[codePoint] = glyphName;
    }
  }
  return cmap;
}


export const glyphChangeFunctions = {
  "=xy": (path, pointIndex, x, y) => path.setPointPosition(pointIndex, x, y),
  ...baseChangeFunctions,
};


class GlyphEditContext {

  constructor(fontController, glyphController, senderID) {
    this.fontController = fontController;
    this.glyphController = glyphController;
    this.senderID = senderID;
    this.throttledEditDo = throttleCalls(async change => {fontController.font.editDo(change)}, 50);
  }

  async setup() {
    const varGlyph = await this.fontController.getGlyph(this.glyphController.name);
    const layerIndex = varGlyph.getLayerIndex(varGlyph.sources[this.glyphController.sourceIndex].layerName);
    this.baseChangePath = ["glyphs", this.glyphController.name, "layers", layerIndex, "glyph"];
  }

  async editBegin() {
    /* await */ this.fontController.font.editBegin();
    await this.fontController.notifyEditListeners("editBegin", this.senderID);
  }

  async editSetRollback(rollback) {
    this.rollback = consolidateChanges(rollback, this.baseChangePath);
    /* await */ this.fontController.font.editSetRollback(this.rollback);
    await this.fontController.notifyEditListeners("editSetRollback", this.senderID, this.rollback);
  }

  async editDo(change) {
    await this.fontController.glyphChanged(this.glyphController.name);
    applyChange(this.glyphController.instance, change, glyphChangeFunctions);
    change = consolidateChanges(change, this.baseChangePath);
    /* await */ this.throttledEditDo(change);
    await this.fontController.notifyEditListeners("editDo", this.senderID, change);
  }

  async editEnd(change) {
    await this.fontController.glyphChanged(this.glyphController.name);
    change = consolidateChanges(change, this.baseChangePath);
    const error = await this.fontController.font.editEnd(change);
    // TODO handle error
    await this.fontController.notifyEditListeners("editEnd", this.senderID, change);
  }

  async editAtomic(change, rollback) {
    applyChange(this.glyphController.glyph, change, glyphChangeFunctions);
    await this.fontController.glyphChanged(this.glyphController.name);
    change = consolidateChanges(change, this.baseChangePath);
    rollback = consolidateChanges(rollback, this.baseChangePath);
    error = await fontController.font.editAtomic(change, rollback);
    // TODO: handle error, rollback
    await this.fontController.notifyEditListeners("editAtomic", this.senderID, change, rollback);
  }

}
