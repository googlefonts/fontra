import { DiscreteVariationModel } from "./discrete-variation-model.js";
import { LRUCache } from "./lru-cache.js";
import {
  // makeSparseNormalizedLocation,
  locationToString,
  mapAxesFromUserSpaceToSourceSpace,
} from "./var-model.js";

export class FontSourcesInstancer {
  constructor(fontAxes, fontSources) {
    this.fontAxes = fontAxes;
    this.fontSources = fontSources;
    this._setup();
  }

  _setup() {
    this.fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(this.fontAxes);
    this.defaultLocation = Object.fromEntries(
      this.fontAxesSourceSpace.map((axis) => [axis.name, axis.defaultValue])
    );
    this.discreteAxes = this.fontAxesSourceSpace.filter((axis) => axis.values);
    this.continuousAxes = this.fontAxesSourceSpace.filter((axis) => !axis.values);
    this.sourcesByLocationString = Object.fromEntries(
      Object.values(this.fontSources).map((source) => [
        locationToString({ ...this.defaultLocation, ...source.location }),
        source,
      ])
    );
    this._instanceCache = new LRUCache(50);
  }

  update() {
    delete this._model;
    delete this._deltas;
    this._setup();
  }

  get model() {
    if (!this._model) {
      const locations = Object.values(this.fontSources).map(
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
    const sourceValues = Object.values(this.fontSources).map((source) => {
      return { ...source, location: null, name: null };
    });
    return this.model.getDeltas(sourceValues);
  }

  instantiate(sourceLocation) {
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
      sourceInstance = instance;
      this._instanceCache.put(locationString, sourceInstance);
    }

    return sourceInstance;
  }
}
