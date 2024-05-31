import {
  pointInConvexPolygon,
  rectIntersectsPolygon,
  simplePolygonArea,
} from "./convex-hull.js";
import {
  DiscreteVariationModel,
  findNearestLocationIndex,
  splitDiscreteLocation,
} from "./discrete-variation-model.js";
import { VariationError } from "./errors.js";
import { filterPathByPointIndices } from "./path-functions.js";
import { PathHitTester } from "./path-hit-tester.js";
import { centeredRect, sectRect, unionRect } from "./rectangle.js";
import {
  getRepresentation,
  registerRepresentationFactory,
} from "./representation-cache.js";
import {
  Transform,
  decomposedToTransform,
  prependTransformToDecomposed,
} from "./transform.js";
import {
  areGuidelinesCompatible,
  enumerate,
  normalizeGuidelines,
  parseSelection,
  range,
} from "./utils.js";
import { addItemwise } from "./var-funcs.js";
import { StaticGlyph } from "./var-glyph.js";
import {
  locationToString,
  makeSparseNormalizedLocation,
  mapAxesFromUserSpaceToSourceSpace,
  normalizeLocation,
} from "./var-model.js";
import { VarPackedPath, joinPaths } from "./var-path.js";

export class VariableGlyphController {
  constructor(glyph, fontAxes) {
    this.glyph = glyph;
    this._fontAxesSourceSpace = mapAxesFromUserSpaceToSourceSpace(fontAxes);
    const glyphAxisNames = new Set(glyph.axes.map((axis) => axis.name));
    this._fontAxisNames = new Set(
      fontAxes
        .map((axis) => axis.name)
        .filter((axisName) => !glyphAxisNames.has(axisName))
    );
    this._locationToSourceIndex = {};
    this._layerGlyphControllers = {};
  }

  get name() {
    return this.glyph.name;
  }

  get axes() {
    return this.glyph.axes;
  }

  get sources() {
    return this.glyph.sources;
  }

  get layers() {
    return this.glyph.layers;
  }

  get combinedAxes() {
    if (this._combinedAxes === undefined) {
      this._setupAxisMapping();
    }
    return this._combinedAxes;
  }

  get continuousAxes() {
    if (this._continuousAxes === undefined) {
      this._setupAxisMapping();
    }
    return this._continuousAxes;
  }

  get discreteAxes() {
    if (this._discreteAxes === undefined) {
      this._setupAxisMapping();
    }
    return this._discreteAxes;
  }

  _setupAxisMapping() {
    this._discreteAxes = [];
    this._continuousAxes = Array.from(this.axes);
    const glyphAxisNames = new Set(this.axes.map((axis) => axis.name));

    for (let fontAxis of this._fontAxesSourceSpace) {
      if (fontAxis.values) {
        this._discreteAxes.push(fontAxis);
      } else if (!glyphAxisNames.has(fontAxis.name)) {
        this._continuousAxes.push(fontAxis);
      }
    }
    this._combinedAxes = [...this._discreteAxes, ...this._continuousAxes];
  }

  getSourceIndex(sourceLocation) {
    const locationStr = locationToString(sourceLocation);
    // TODO: fix the unboundedness of the _locationToSourceIndex cache
    if (!(locationStr in this._locationToSourceIndex)) {
      this._locationToSourceIndex[locationStr] = this._getSourceIndex(sourceLocation);
    }
    return this._locationToSourceIndex[locationStr];
  }

  _getSourceIndex(sourceLocation) {
    sourceLocation = this.expandNLIAxes(sourceLocation);
    for (let i = 0; i < this.sources.length; i++) {
      const source = this.sources[i];
      if (source.inactive) {
        continue;
      }
      const seen = new Set();
      let found = true;
      for (const axis of this.axes.concat(this._fontAxesSourceSpace)) {
        if (seen.has(axis.name)) {
          continue;
        }
        seen.add(axis.name);
        let varValue = sourceLocation[axis.name];
        let sourceValue = source.location[axis.name];
        if (varValue === undefined) {
          varValue = axis.defaultValue;
        }
        if (sourceValue === undefined) {
          sourceValue = axis.defaultValue;
        }
        if (Math.abs(varValue - sourceValue) > 0.000000001) {
          found = false;
          break;
        }
      }
      if (found) {
        return i;
      }
    }
    return undefined;
  }

  getSourceIndexFromName(sourceName) {
    for (const [sourceIndex, source] of enumerate(this.sources)) {
      if (source.name === sourceName) {
        return sourceIndex;
      }
    }
  }

  getAllComponentNames() {
    // Return a set of all component names used by all layers of all sources
    const componentNames = new Set();
    for (const layer of Object.values(this.glyph.layers)) {
      for (const component of layer.glyph.components) {
        componentNames.add(component.name);
      }
    }
    return componentNames;
  }

  clearCaches() {
    this.clearDeltasCache();
    this.clearModelCache();
  }

  clearDeltasCache() {
    // Call this when a source layer changed
    delete this._deltas;
  }

  clearModelCache() {
    // Call this when global or local design spaces changed
    delete this._model;
    delete this._deltas;
    delete this._sourceInterpolationStatus;
    delete this._combinedAxes;
    delete this._discreteAxes;
    delete this._continuousAxes;
    this._locationToSourceIndex = {};
    this._layerGlyphControllers = {};
  }

  get model() {
    if (this._model === undefined) {
      const locations = this.sources
        .filter((source) => !source.inactive)
        .map((source) => source.location);
      this._model = new DiscreteVariationModel(
        locations,
        this.discreteAxes,
        this.continuousAxes
      );
    }
    return this._model;
  }

  _getLocationErrors() {
    // XXXX This method is currently not used, and also broken wrt. discrete axes
    const locationStrings = this.sources.map((source) =>
      source.inactive
        ? null
        : locationToString(
            makeSparseNormalizedLocation(
              normalizeLocation(source.location, this.combinedAxes)
            )
          )
    );
    const bag = {};
    for (const [i, s] of enumerate(locationStrings)) {
      if (s) {
        if (bag[s]) {
          bag[s].push(i);
        } else {
          bag[s] = [i];
        }
      }
    }
    return locationStrings.map((s) =>
      bag[s]?.length > 1
        ? `location is not unique in sources ${bag[s]
            .map((i) => this.sources[i].name)
            .join(", ")}`
        : null
    );
  }

  async getDeltas(getGlyphFunc) {
    if (this._deltas === undefined) {
      const masterValues = await ensureGlyphCompatibility(
        this.sources
          .filter((source) => !source.inactive)
          .map((source) => this.layers[source.layerName].glyph),
        getGlyphFunc
      );

      this._deltas = this.model.getDeltas(masterValues);
    }
    return this._deltas;
  }

  get sourceInterpolationStatus() {
    if (this._sourceInterpolationStatus === undefined) {
      this._sourceInterpolationStatus = this._computeSourceInterpolationStatus();
    }
    return this._sourceInterpolationStatus;
  }

  _computeSourceInterpolationStatus() {
    const status = new Array(this.sources.length);
    status.fill({});
    for (const sourcesInfo of this._splitSourcesByDiscreteLocation()) {
      const { errors, referenceLayerName } = this._computeInterpolStatusForSources(
        sourcesInfo.sources,
        sourcesInfo.defaultSourceLayerName
      );

      for (const { sourceIndex, source, discreteLocationKey } of sourcesInfo.sources) {
        if (this._modelErrors?.[i]) {
          status[sourceIndex] = {
            error: this._modelErrors[i],
            isModelError: true,
            discreteLocationKey,
          };
        } else {
          const error = errors[referenceLayerName][source.layerName];
          status[sourceIndex] = error
            ? { error, discreteLocationKey }
            : { discreteLocationKey };
        }
      }
    }
    return status;
  }

  _computeInterpolStatusForSources(sources, defaultSourceLayerName) {
    const layerGlyphs = {};
    for (const { source } of sources) {
      if (source.layerName in layerGlyphs) {
        continue;
      }
      layerGlyphs[source.layerName] = stripGuidelinesAndComponentLocations(
        this.layers[source.layerName].glyph
      );
    }

    let layerNames = Object.keys(layerGlyphs);
    layerNames = [
      defaultSourceLayerName,
      ...layerNames.filter((name) => name !== defaultSourceLayerName),
    ].slice(0, Math.ceil(layerNames.length / 2));

    const errors = {};
    let referenceLayerName = defaultSourceLayerName;
    for (const layerName of layerNames) {
      errors[layerName] = checkInterpolationCompatibility(
        layerName,
        layerGlyphs,
        errors
      );
      if (Object.keys(errors[layerName]).length <= sources.length / 2) {
        // The number of incompatible sources is half of all sources or less:
        // we've found the optimal reference layer.
        referenceLayerName = layerName;
        break;
      }
    }
    return { errors, referenceLayerName };
  }

  _splitSourcesByDiscreteLocation() {
    const splitSources = {};
    for (const [sourceIndex, source] of enumerate(this.sources)) {
      const splitLoc = splitDiscreteLocation(source.location, this.discreteAxes);
      const key = JSON.stringify(splitLoc.discreteLocation);
      if (!(key in splitSources)) {
        const defaultSourceIndex = this.model.getDefaultSourceIndexForDiscreteLocation(
          splitLoc.discreteLocation
        );
        const defaultSourceLayerName = this.sources[defaultSourceIndex].layerName;
        splitSources[key] = { sources: [], defaultSourceIndex, defaultSourceLayerName };
      }
      splitSources[key].sources.push({ sourceIndex, source, discreteLocationKey: key });
    }
    return Object.values(splitSources);
  }

  getInterpolationContributions(sourceLocation) {
    sourceLocation = this.expandNLIAxes(sourceLocation);
    const contributions = this.model.getSourceContributions(sourceLocation);

    let sourceIndex = 0;
    const orderedContributions = [];
    for (const source of this.sources) {
      if (source.inactive) {
        orderedContributions.push(null);
      } else {
        const value = contributions[sourceIndex];
        orderedContributions.push(value);
        sourceIndex++;
      }
    }
    return orderedContributions;
  }

  async getLayerGlyphController(layerName, sourceIndex, getGlyphFunc) {
    const cacheKey = `${layerName}/${sourceIndex}`;
    let instanceController = this._layerGlyphControllers[cacheKey];
    if (instanceController === undefined) {
      const layer = this.layers[layerName];
      if (layer) {
        instanceController = new StaticGlyphController(
          this.name,
          layer.glyph,
          sourceIndex,
          layerName
        );
        await instanceController.setupComponents(
          getGlyphFunc,
          filterLocation(this.sources[sourceIndex].location, this._fontAxisNames),
          this._fontAxisNames
        );
      } else {
        instanceController = null;
      }
      this._layerGlyphControllers[cacheKey] = instanceController;
    }
    return instanceController;
  }

  async instantiate(sourceLocation, getGlyphFunc) {
    let { instance, errors } = this.model.interpolateFromDeltas(
      sourceLocation,
      await this.getDeltas(getGlyphFunc)
    );
    if (errors) {
      errors = errors.map((error) => {
        return { ...error, glyphs: [this.name] };
      });
    }
    return { instance, errors };
  }

  async instantiateController(sourceLocation, layerName, getGlyphFunc) {
    let sourceIndex = this.getSourceIndex(sourceLocation);
    sourceLocation = this.expandNLIAxes(sourceLocation);

    if (!layerName || !(layerName in this.layers)) {
      if (sourceIndex !== undefined) {
        layerName = this.sources[sourceIndex].layerName;
      }
    }
    if (layerName && sourceIndex === undefined) {
      for (const [i, source] of enumerate(this.sources)) {
        if (source.layerName === layerName) {
          sourceIndex = i;
          break;
        }
      }
    }

    if (layerName != undefined) {
      return await this.getLayerGlyphController(layerName, sourceIndex, getGlyphFunc);
    }

    const { instance, errors } = await this.instantiate(sourceLocation, getGlyphFunc);

    if (!instance) {
      throw new Error("assert -- instance is undefined");
    }
    const instanceController = new StaticGlyphController(
      this.name,
      instance,
      sourceIndex,
      layerName,
      errors
    );

    await instanceController.setupComponents(
      getGlyphFunc,
      filterLocation(sourceLocation, this._fontAxisNames),
      this._fontAxisNames
    );
    return instanceController;
  }

  getSourceLocationFromSourceIndex(sourceIndex) {
    const fontDefaultLocation = makeDefaultLocation(this._fontAxesSourceSpace);
    const glyphDefaultLocation = makeDefaultLocation(this.axes);
    const defaultLocation = { ...fontDefaultLocation, ...glyphDefaultLocation };
    const sourceLocation = this.sources[sourceIndex].location;
    return { ...defaultLocation, ...sourceLocation };
  }

  findNearestSourceFromSourceLocation(sourceLocation, skipInactive = false) {
    sourceLocation = this.expandNLIAxes(sourceLocation);
    const splitLoc = splitDiscreteLocation(sourceLocation, this.discreteAxes);

    // Ensure locations are *not* sparse

    const defaultLocation = Object.fromEntries(
      this.combinedAxes.map((axis) => [axis.name, axis.defaultValue])
    );

    const targetLocation = { ...defaultLocation, ...sourceLocation };
    const sourceIndexMapping = [];
    const activeLocations = [];
    for (const [index, source] of enumerate(this.sources)) {
      if (source.inactive) {
        continue;
      }
      sourceIndexMapping.push(index);
      activeLocations.push({ ...defaultLocation, ...source.location });
    }

    const nearestIndex = findNearestLocationIndex(targetLocation, activeLocations);
    return sourceIndexMapping[nearestIndex];
  }

  expandNLIAxes(sourceLocation) {
    return mapLocationExpandNLI(sourceLocation, this.axes);
  }

  foldNLIAxes(sourceLocation) {
    return mapLocationFoldNLI(sourceLocation);
  }
}

export class StaticGlyphController {
  constructor(name, instance, sourceIndex, layerName, errors) {
    this.name = name;
    this.instance = instance;
    this.sourceIndex = sourceIndex;
    this.layerName = layerName;
    this.errors = errors;
    this.canEdit = layerName != undefined;
    this.components = [];
  }

  async setupComponents(getGlyphFunc, parentLocation, fontAxisNames) {
    this.components = [];
    const componentErrors = [];
    for (const compo of this.instance.components) {
      const compoController = new ComponentController(compo);
      const errors = await compoController.setupPath(
        getGlyphFunc,
        parentLocation,
        [this.name],
        fontAxisNames
      );
      if (errors) {
        componentErrors.push(...errors);
      }
      this.components.push(compoController);
    }
    this._extendErrors(componentErrors);
  }

  _extendErrors(errors) {
    if (!errors.length) {
      return;
    }
    if (!this.errors) {
      this.errors = [];
    }
    this.errors.push(...errors);
  }

  get xAdvance() {
    return this.instance.xAdvance;
  }

  get yAdvance() {
    return this.instance.yAdvance;
  }

  get leftMargin() {
    return this.bounds ? this.bounds.xMin : undefined;
  }

  get rightMargin() {
    return this.bounds ? this.instance.xAdvance - this.bounds.xMax : undefined;
  }

  get verticalOrigin() {
    return this.instance.verticalOrigin;
  }

  get anchors() {
    return this.instance.anchors;
  }

  get guidelines() {
    return this.instance.guidelines;
  }

  get path() {
    return this.instance.path;
  }

  get flattenedPath() {
    return getRepresentation(this, "flattenedPath");
  }

  get flattenedPath2d() {
    return getRepresentation(this, "flattenedPath2d");
  }

  get closedContoursPath2d() {
    return getRepresentation(this, "closedContoursPath2d");
  }

  get componentsPath() {
    return getRepresentation(this, "componentsPath");
  }

  get bounds() {
    return getRepresentation(this, "bounds");
  }

  get controlBounds() {
    return getRepresentation(this, "controlBounds");
  }

  get isEmptyIsh() {
    return getRepresentation(this, "isEmptyIsh");
  }

  get convexHull() {
    return getRepresentation(this, "convexHull");
  }

  get convexHullArea() {
    return getRepresentation(this, "convexHullArea");
  }

  get pathHitTester() {
    return getRepresentation(this, "pathHitTester");
  }

  get flattenedPathHitTester() {
    return getRepresentation(this, "flattenedPathHitTester");
  }

  getSelectionBounds(selection) {
    let {
      point: pointIndices,
      component: componentIndices,
      anchor: anchorIndices,
    } = parseSelection(selection);

    pointIndices = pointIndices || [];
    componentIndices = componentIndices || [];
    anchorIndices = anchorIndices || [];

    const selectionRects = [];
    if (pointIndices.length) {
      const path = filterPathByPointIndices(this.instance.path, pointIndices);
      if (path) {
        selectionRects.push(path.getBounds());
      }
    }

    for (const componentIndex of componentIndices) {
      const component = this.components[componentIndex];
      if (!component || !component.bounds) {
        continue;
      }
      selectionRects.push(component.bounds);
    }

    for (const anchorIndex of anchorIndices) {
      const anchor = this.instance.anchors[anchorIndex];
      selectionRects.push(centeredRect(anchor.x, anchor.y, 0));
    }

    return unionRect(...selectionRects);
  }
}

registerRepresentationFactory(StaticGlyphController, "flattenedPath", (glyph) => {
  return joinPaths([glyph.instance.path, glyph.componentsPath]);
});

registerRepresentationFactory(StaticGlyphController, "flattenedPath2d", (glyph) => {
  const flattenedPath2d = new Path2D();
  glyph.flattenedPath.drawToPath2d(flattenedPath2d);
  return flattenedPath2d;
});

registerRepresentationFactory(
  StaticGlyphController,
  "closedContoursPath2d",
  (glyph) => {
    const closedContoursPath2d = new Path2D();
    const path = glyph.flattenedPath;
    if (path.contourInfo.every((contour) => contour.isClosed)) {
      // No open contours found, just use flattenedPath2d
      return glyph.flattenedPath2d;
    }
    for (const [i, contour] of enumerate(path.contourInfo)) {
      if (contour.isClosed) {
        path.drawContourToPath2d(closedContoursPath2d, i);
      }
    }
    return closedContoursPath2d;
  }
);

registerRepresentationFactory(StaticGlyphController, "componentsPath", (glyph) => {
  return joinPaths(glyph.components.map((compo) => compo.path));
});

registerRepresentationFactory(StaticGlyphController, "bounds", (glyph) => {
  return glyph.flattenedPath.getBounds();
});

registerRepresentationFactory(StaticGlyphController, "controlBounds", (glyph) => {
  return glyph.flattenedPath.getControlBounds();
});

registerRepresentationFactory(StaticGlyphController, "isEmptyIsh", (glyph) => {
  let startPoint = 0;
  for (const contour of glyph.flattenedPath.contourInfo) {
    const endPoint = contour.endPoint;
    if (endPoint - startPoint > 1) {
      // If the contour has more than two points, we consider it not empty-ish
      return false;
    }
    startPoint = endPoint + 1;
  }
  return true;
});

registerRepresentationFactory(StaticGlyphController, "convexHull", (glyph) => {
  return glyph.flattenedPath.getConvexHull();
});

registerRepresentationFactory(StaticGlyphController, "convexHullArea", (glyph) => {
  return glyph.convexHull ? Math.abs(simplePolygonArea(glyph.convexHull)) : 0;
});

registerRepresentationFactory(StaticGlyphController, "pathHitTester", (glyph) => {
  return new PathHitTester(glyph.path, glyph.controlBounds);
});

registerRepresentationFactory(
  StaticGlyphController,
  "flattenedPathHitTester",
  (glyph) => {
    return new PathHitTester(glyph.flattenedPath, glyph.controlBounds);
  }
);

class ComponentController {
  constructor(compo) {
    this.compo = compo;
  }

  async setupPath(getGlyphFunc, parentLocation, parentGlyphNames, fontAxisNames) {
    const { path, errors } = await flattenComponent(
      this.compo,
      getGlyphFunc,
      parentLocation,
      parentGlyphNames,
      fontAxisNames
    );
    this.path = path;
    return errors;
  }

  get path2d() {
    if (this._path2d === undefined) {
      this._path2d = new Path2D();
      this.path.drawToPath2d(this._path2d);
    }
    return this._path2d;
  }

  get bounds() {
    if (this._bounds === undefined) {
      this._bounds = this.path.getBounds();
    }
    return this._bounds;
  }

  get controlBounds() {
    if (this._controlBounds === undefined) {
      this._controlBounds = this.path.getControlBounds();
    }
    return this._controlBounds;
  }

  get convexHull() {
    if (this._convexHull === undefined) {
      this._convexHull = this.path.getConvexHull();
    }
    return this._convexHull;
  }

  get unpackedContours() {
    if (this._unpackedContours === undefined) {
      const unpackedContours = [];
      for (let i = 0; i < this.path.numContours; i++) {
        const contour = this.path.getUnpackedContour(i);
        contour.controlBounds = this.path.getControlBoundsForContour(i);
        unpackedContours.push(contour);
      }
      this._unpackedContours = unpackedContours;
    }
    return this._unpackedContours;
  }

  intersectsRect(rect) {
    const controlBounds = this.controlBounds;
    return (
      controlBounds &&
      sectRect(rect, controlBounds) &&
      (pointInConvexPolygon(rect.xMin, rect.yMin, this.convexHull) ||
        rectIntersectsPolygon(rect, this.convexHull)) &&
      this.unpackedContours.some(
        (contour) =>
          sectRect(rect, contour.controlBounds) &&
          rectIntersectsPolygon(rect, contour.points)
      )
    );
  }
}

async function flattenComponent(
  compo,
  getGlyphFunc,
  parentLocation,
  parentGlyphNames,
  fontAxisNames
) {
  let componentErrors = [];
  const paths = [];
  for await (const { path, errors } of iterFlattenedComponentPaths(
    compo,
    getGlyphFunc,
    parentLocation,
    parentGlyphNames,
    fontAxisNames
  )) {
    paths.push(path);
    if (errors) {
      componentErrors.push(...errors);
    }
  }
  if (!componentErrors.length) {
    componentErrors = undefined;
  }
  return { path: joinPaths(paths), errors: componentErrors };
}

async function* iterFlattenedComponentPaths(
  compo,
  getGlyphFunc,
  parentLocation,
  parentGlyphNames,
  fontAxisNames,
  transformation = null,
  seenGlyphNames = null
) {
  if (!seenGlyphNames) {
    seenGlyphNames = new Set();
  } else if (seenGlyphNames.has(compo.name)) {
    // Avoid infinite recursion
    return;
  }
  seenGlyphNames.add(compo.name);
  parentGlyphNames = [...parentGlyphNames, compo.name];

  const compoLocation = mergeLocations(parentLocation, compo.location);
  const glyph = await getGlyphFunc(compo.name);
  let inst, instErrors;
  if (!glyph) {
    // console.log(`component glyph ${compo.name} was not found`);
    inst = makeMissingComponentPlaceholderGlyph();
  } else {
    const { instance, errors } = await glyph.instantiate(compoLocation, getGlyphFunc);
    inst = instance;
    instErrors = errors?.map((error) => {
      return { ...error, glyphs: parentGlyphNames };
    });
    if (!inst.path.numPoints && !inst.components.length) {
      inst = makeEmptyComponentPlaceholderGlyph();
    }
  }
  let t = decomposedToTransform(compo.transformation);
  if (transformation) {
    t = transformation.transform(t);
  }
  const componentPaths = {};
  if (inst.path.numPoints) {
    yield { path: inst.path.transformed(t), errors: instErrors };
  }
  for (const subCompo of inst.components) {
    yield* iterFlattenedComponentPaths(
      subCompo,
      getGlyphFunc,
      filterLocation(compoLocation, fontAxisNames),
      parentGlyphNames,
      fontAxisNames,
      t,
      seenGlyphNames
    );
  }
  seenGlyphNames.delete(compo.name);
}

export async function decomposeComponents(
  components,
  componentIndices,
  parentSourceLocation,
  getGlyphFunc
) {
  if (!componentIndices) {
    componentIndices = range(instance.components.length);
  }

  const newPaths = [];
  const newComponents = [];
  const newAnchors = [];
  for (const index of componentIndices) {
    const component = components[index];
    const baseGlyph = await getGlyphFunc(component.name);
    if (!baseGlyph) {
      // Missing base glyph
      continue;
    }
    const location = {
      ...parentSourceLocation,
      ...component.location,
    };

    const { instance: compoInstance, errors } = await baseGlyph.instantiate(
      location,
      getGlyphFunc
    );
    const t = decomposedToTransform(component.transformation);
    newPaths.push(compoInstance.path.transformed(t));
    for (const nestedCompo of compoInstance.components) {
      newComponents.push({
        name: nestedCompo.name,
        transformation: prependTransformToDecomposed(t, nestedCompo.transformation),
        location: { ...nestedCompo.location },
      });
    }
    for (const anchor of compoInstance.anchors) {
      const [x, y] = t.transformPoint(anchor.x, anchor.y);
      newAnchors.push({
        name: anchor.name,
        x,
        y,
      });
    }
  }
  const newPath = joinPaths(newPaths);
  return { path: newPath, components: newComponents, anchors: newAnchors };
}

export function getAxisBaseName(axisName) {
  return axisName.split("*", 1)[0];
}

function mapLocationExpandNLI(userLocation, axes) {
  const nliAxes = {};
  for (const axis of axes) {
    const baseName = axis.name.split("*", 1)[0];
    if (baseName !== axis.name) {
      if (!(baseName in nliAxes)) {
        nliAxes[baseName] = [];
      }
      nliAxes[baseName].push(axis.name);
    }
  }
  const location = {};
  for (const [baseName, value] of Object.entries(userLocation)) {
    for (const realName of nliAxes[baseName] || [baseName]) {
      location[realName] = value;
    }
  }
  return location;
}

function mapLocationFoldNLI(location, axes) {
  const userLocation = {};
  for (const [axisName, axisValue] of Object.entries(location)) {
    const baseName = axisName.split("*", 1)[0];
    userLocation[baseName] = axisValue;
  }
  return userLocation;
}

function mergeLocations(loc1, loc2) {
  if (!loc1) {
    return loc2 || {};
  }
  return { ...loc1, ...loc2 };
}

function filterLocation(loc, axisNames) {
  return Object.fromEntries(
    Object.entries(loc).filter((entry) => axisNames.has(entry[0]))
  );
}

function subsetLocation(location, axes) {
  const subsettedLocation = {};
  for (const axis of axes) {
    if (axis.name in location) {
      subsettedLocation[axis.name] = location[axis.name];
    }
  }
  return subsettedLocation;
}

function makeMissingComponentPlaceholderGlyph() {
  const path = new VarPackedPath();
  path.moveTo(0, 0);
  path.lineTo(0, 350);
  path.lineTo(350, 350);
  path.lineTo(350, 0);
  path.closePath();
  path.moveTo(20, 10);
  path.lineTo(175, 165);
  path.lineTo(330, 10);
  path.lineTo(340, 20);
  path.lineTo(185, 175);
  path.lineTo(340, 330);
  path.lineTo(330, 340);
  path.lineTo(175, 185);
  path.lineTo(20, 340);
  path.lineTo(10, 330);
  path.lineTo(165, 175);
  path.lineTo(10, 20);
  path.closePath();
  return StaticGlyph.fromObject({ path: path });
}

function makeEmptyComponentPlaceholderGlyph() {
  const path = new VarPackedPath();
  const numSq = 12;
  const side = 14;
  const dist = side * 2;

  function sq(x, y) {
    path.moveTo(x, y);
    path.lineTo(x, y + side);
    path.lineTo(x + side, y + side);
    path.lineTo(x + side, y);
    path.closePath();
  }

  for (const i of range(numSq)) {
    sq(dist * i, 0);
    sq(0, dist + dist * i);
    sq(dist + dist * i, 12 * dist);
    sq(12 * dist, dist * i);
  }

  return StaticGlyph.fromObject({ path: path });
}

function makeDefaultLocation(axes) {
  return Object.fromEntries(axes.map((axis) => [axis.name, axis.defaultValue]));
}

async function ensureGlyphCompatibility(glyphs, getGlyphFunc) {
  const baseGlyphFallbackValues = {};

  glyphs.forEach((glyph) =>
    glyph.components.forEach((compo) => {
      let fallbackValues = baseGlyphFallbackValues[compo.name];
      if (!fallbackValues) {
        fallbackValues = {};
        baseGlyphFallbackValues[compo.name] = fallbackValues;
      }
      for (const axisName in compo.location) {
        fallbackValues[axisName] = 0;
      }
    })
  );

  for (const [glyphName, fallbackValues] of Object.entries(baseGlyphFallbackValues)) {
    const baseGlyph = await getGlyphFunc(glyphName);
    for (const axis of baseGlyph?.combinedAxes || []) {
      if (axis.name in fallbackValues) {
        fallbackValues[axis.name] = axis.defaultValue;
      }
    }
  }

  const guidelinesAreCompatible = areGuidelinesCompatible(glyphs);

  return glyphs.map((glyph) =>
    StaticGlyph.fromObject(
      {
        ...glyph,
        components: glyph.components.map((component) => {
          return {
            ...component,
            location: {
              ...baseGlyphFallbackValues[component.name],
              ...component.location,
            },
          };
        }),
        guidelines: guidelinesAreCompatible
          ? normalizeGuidelines(glyph.guidelines)
          : [],
      },
      true // noCopy
    )
  );
}

function stripGuidelinesAndComponentLocations(glyph) {
  if (!glyph.components.length && !glyph.guidelines.length) {
    return glyph;
  }
  return StaticGlyph.fromObject(
    {
      ...glyph,
      components: glyph.components.map((component) => {
        return {
          ...component,
          location: {},
        };
      }),
      guidelines: [],
    },
    true // noCopy
  );
}

function checkInterpolationCompatibility(
  referenceLayerName,
  layerGlyphs,
  previousErrors
) {
  const referenceGlyph = layerGlyphs[referenceLayerName];
  const errors = {};
  for (const [layerName, glyph] of Object.entries(layerGlyphs)) {
    if (layerName === referenceLayerName) {
      continue;
    }
    if (layerName in previousErrors) {
      const error = previousErrors[layerName][referenceLayerName];
      if (error) {
        errors[layerName] = error;
      }
    } else {
      try {
        const _ = addItemwise(referenceGlyph, glyph);
      } catch (error) {
        errors[layerName] = error.message;
      }
    }
  }
  return errors;
}
