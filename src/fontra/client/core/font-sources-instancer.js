import { DiscreteVariationModel } from "./discrete-variation-model.js";
import { LRUCache } from "./lru-cache.js";
import { areGuidelinesCompatible, normalizeGuidelines } from "./utils.js";
import { locationToString, mapAxesFromUserSpaceToSourceSpace } from "./var-model.js";

export class FontSourcesInstancer {
  constructor(fontAxes, fontSources) {
    this.fontAxes = fontAxes;
    this.fontSources = fontSources;
    this._setup();
  }

  _setup() {
    this.fontSourcesList = Object.values(this.fontSources).filter(
      (source) => !source.isSparse
    );
    this.fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(this.fontAxes);
    this.defaultLocation = Object.fromEntries(
      this.fontAxesSourceSpace.map((axis) => [axis.name, axis.defaultValue])
    );
    this.discreteAxes = this.fontAxesSourceSpace.filter((axis) => axis.values);
    this.continuousAxes = this.fontAxesSourceSpace.filter((axis) => !axis.values);
    this.sourcesByLocationString = Object.fromEntries(
      this.fontSourcesList.map((source) => [
        locationToString({ ...this.defaultLocation, ...source.location }),
        source,
      ])
    );
    this._instanceCache = new LRUCache(50);
  }

  get model() {
    if (!this._model) {
      const locations = this.fontSourcesList.map(
        (source) => source.location,
        this.fontAxesSourceSpace
      );
      this._model = new DiscreteVariationModel(
        locations,
        this.discreteAxes,
        this.continuousAxes
      );
    }
    return this._model;
  }

  get deltas() {
    const guidelinesAreCompatible = areGuidelinesCompatible(this.fontSourcesList);

    const fixedSourceValues = this.fontSourcesList.map((source) => {
      return {
        ...source,
        location: null,
        name: null,
        guidelines: guidelinesAreCompatible
          ? normalizeGuidelines(source.guidelines)
          : [],
      };
    });
    return this.model.getDeltas(fixedSourceValues);
  }

  instantiate(sourceLocation) {
    if (!this.fontSourcesList.length) {
      return undefined;
    }
    sourceLocation = { ...this.defaultLocation, ...sourceLocation };
    const locationString = locationToString(sourceLocation);

    if (locationString in this.sourcesByLocationString) {
      return this.sourcesByLocationString[locationString];
    }

    let sourceInstance = this._instanceCache.get(locationString);

    if (!sourceInstance) {
      const deltas = this.deltas;
      const { instance, errors } = this.model.interpolateFromDeltas(
        sourceLocation,
        deltas
      );
      if (errors?.length) {
        console.log("error while interpolating font sources", errors);
      }
      sourceInstance = instance;
      this._instanceCache.put(locationString, sourceInstance);
    }

    return sourceInstance;
  }
}
