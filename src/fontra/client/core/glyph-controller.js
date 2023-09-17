import {
  pointInConvexPolygon,
  rectIntersectsPolygon,
  simplePolygonArea,
} from "./convex-hull.js";
import { PathHitTester } from "./path-hit-tester.js";
import { sectRect } from "./rectangle.js";
import {
  getRepresentation,
  registerRepresentationFactory,
} from "./representation-cache.js";
import { Transform } from "./transform.js";
import { enumerate, makeAffineTransform, range } from "./utils.js";
import { StaticGlyph } from "./var-glyph.js";
import { addItemwise } from "./var-funcs.js";
import {
  VariationModel,
  locationToString,
  mapForward,
  mapBackward,
  normalizeLocation,
  piecewiseLinearMap,
} from "./var-model.js";
import { VarPackedPath, joinPathsAsync, joinPaths } from "./var-path.js";

export class VariableGlyphController {
  constructor(glyph, globalAxes) {
    this.glyph = glyph;
    this.globalAxes = globalAxes;
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

  get localToGlobalMapping() {
    if (this._localToGlobalMapping === undefined) {
      this._setupAxisMapping();
    }
    return this._localToGlobalMapping;
  }

  _setupAxisMapping() {
    this._combinedAxes = Array.from(this.axes);
    this._localToGlobalMapping = [];
    const localAxisDict = {};
    for (const localAxis of this.axes) {
      localAxisDict[localAxis.name] = localAxis;
    }
    for (let globalAxis of this.globalAxes) {
      // Apply user-facing avar mapping: we need "designspace" coordinates here
      const mapFunc = makeAxisMapFunc(globalAxis);
      globalAxis = {
        name: globalAxis.name,
        minValue: mapFunc(globalAxis.minValue),
        defaultValue: mapFunc(globalAxis.defaultValue),
        maxValue: mapFunc(globalAxis.maxValue),
      };
      const localAxis = localAxisDict[globalAxis.name];
      if (localAxis) {
        const mapping = [
          [localAxis.minValue, globalAxis.minValue],
          [localAxis.defaultValue, globalAxis.defaultValue],
          [localAxis.maxValue, globalAxis.maxValue],
        ];
        this._localToGlobalMapping.push({ name: globalAxis.name, mapping: mapping });
      } else {
        this._combinedAxes.push(globalAxis);
      }
    }
  }

  getSourceIndex(location) {
    const locationStr = locationToString(location);
    // TODO: fix the unboundedness of the _locationToSourceIndex cache
    if (!(locationStr in this._locationToSourceIndex)) {
      this._locationToSourceIndex[locationStr] = this._getSourceIndex(location);
    }
    return this._locationToSourceIndex[locationStr];
  }

  _getSourceIndex(location) {
    location = this.mapLocationGlobalToLocal(location);
    for (let i = 0; i < this.sources.length; i++) {
      const source = this.sources[i];
      if (source.inactive) {
        continue;
      }
      const seen = new Set();
      let found = true;
      for (const axis of this.axes.concat(this.globalAxes)) {
        if (seen.has(axis.name)) {
          continue;
        }
        seen.add(axis.name);
        const axisDefaultValue = piecewiseLinearMap(
          axis.defaultValue,
          Object.fromEntries(axis.mapping || [])
        );
        let varValue = location[axis.name];
        let sourceValue = source.location[axis.name];
        if (varValue === undefined) {
          varValue = axisDefaultValue;
        }
        if (sourceValue === undefined) {
          sourceValue = axisDefaultValue;
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
    delete this._localToGlobalMapping;
    this._locationToSourceIndex = {};
    this._layerGlyphControllers = {};
  }

  get model() {
    if (this._model === undefined) {
      const locations = this.sources
        .filter((source) => !source.inactive)
        .map((source) => source.location);
      this._model = new VariationModel(
        locations.map((location) =>
          sparsifyLocation(normalizeLocation(location, this.combinedAxes))
        )
      );
    }
    return this._model;
  }

  async getDeltas(getGlyphFunc) {
    if (this._deltas === undefined) {
      const masterValues = await ensureComponentCompatibility(
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
      const layerGlyphs = {};
      for (const source of this.sources) {
        if (source.layerName in layerGlyphs) {
          continue;
        }
        layerGlyphs[source.layerName] = stripComponentLocations(
          this.layers[source.layerName].glyph
        );
      }
      const defaultSourceIndex = this.model?.reverseMapping[0] || 0;
      const defaultSourceGlyph =
        layerGlyphs[this.sources[defaultSourceIndex].layerName];
      this._sourceInterpolationStatus = this.sources.map((source) => {
        const sourceGlyph = layerGlyphs[source.layerName];
        if (sourceGlyph !== defaultSourceGlyph) {
          try {
            const _ = addItemwise(defaultSourceGlyph, sourceGlyph);
          } catch (error) {
            return { error: error.message };
          }
        }
        return {};
      });
    }
    return this._sourceInterpolationStatus;
  }

  getInterpolationContributions(location) {
    location = this.mapLocationGlobalToLocal(location);
    location = normalizeLocation(location, this.combinedAxes);
    const contributions = this.model.getContributions(location);

    let sourceIndex = 0;
    const orderedContributions = [];
    for (const source of this.sources) {
      if (source.inactive) {
        orderedContributions.push(null);
      } else {
        const value = contributions[this.model.mapping[sourceIndex]];
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
          sourceIndex
        );
        await instanceController.setupComponents(
          getGlyphFunc,
          this.sources[sourceIndex].location
        );
      } else {
        instanceController = null;
      }
      this._layerGlyphControllers[cacheKey] = instanceController;
    }
    return instanceController;
  }

  async instantiate(normalizedLocation, getGlyphFunc) {
    try {
      return this.model.interpolateFromDeltas(
        normalizedLocation,
        await this.getDeltas(getGlyphFunc)
      );
    } catch (error) {
      if (error.name !== "VariationError") {
        throw error;
      }
      const errorMessage = `Interpolation error while instantiating glyph ${
        this.name
      } (${error.toString()})`;
      console.log(errorMessage);
      const indexInfo = findNearestSourceIndexFromLocation(
        this.glyph,
        normalizedLocation,
        this.combinedAxes
      );
      return this.layers[this.sources[indexInfo.index].layerName].glyph;
    }
  }

  async instantiateController(location, getGlyphFunc) {
    const sourceIndex = this.getSourceIndex(location);
    location = this.mapLocationGlobalToLocal(location);

    let instance;
    if (sourceIndex !== undefined) {
      instance = this.layers[this.sources[sourceIndex].layerName].glyph;
    } else {
      instance = await this.instantiate(
        normalizeLocation(location, this.combinedAxes),
        getGlyphFunc
      );
    }

    if (!instance) {
      throw new Error("assert -- instance is undefined");
    }
    const instanceController = new StaticGlyphController(
      this.name,
      instance,
      sourceIndex
    );

    await instanceController.setupComponents(getGlyphFunc, location);
    return instanceController;
  }

  mapSourceLocationToGlobal(sourceIndex) {
    const globalDefaultLocation = mapForward(
      makeDefaultLocation(this.globalAxes),
      this.globalAxes
    );
    const localDefaultLocation = makeDefaultLocation(this.axes);
    const defaultLocation = { ...globalDefaultLocation, ...localDefaultLocation };
    const sourceLocation = this.sources[sourceIndex].location;
    return this.mapLocationLocalToGlobal({
      ...defaultLocation,
      ...sourceLocation,
    });
  }

  findNearestSourceFromGlobalLocation(location, skipInactive = false) {
    const normalizedLocation = normalizeLocation(
      this.mapLocationGlobalToLocal(location),
      this.combinedAxes
    );
    const indexInfo = findNearestSourceIndexFromLocation(
      this.glyph,
      normalizedLocation,
      this.combinedAxes,
      skipInactive
    );
    return indexInfo.index;
  }

  mapLocationGlobalToLocal(location) {
    // Apply global axis mapping (user-facing avar)
    location = mapForward(location, this.globalAxes);
    // Map axes that exist both globally and locally to their local ranges
    location = mapBackward(location, this.localToGlobalMapping);
    // Expand folded NLI axes to their "real" axes
    location = mapLocationExpandNLI(location, this.axes);
    return location;
  }

  mapLocationLocalToGlobal(location) {
    // Fold NLI Axis into single user-facing axes
    location = mapLocationFoldNLI(location);
    // Map axes that exist both globally and locally to their global ranges
    location = mapForward(location, this.localToGlobalMapping);
    // Un-apply global axis mapping (user-facing avar)
    location = mapBackward(location, this.globalAxes);
    return location;
  }
}

export class StaticGlyphController {
  constructor(name, instance, sourceIndex) {
    this.name = name;
    this.instance = instance;
    this.sourceIndex = sourceIndex;
    this.canEdit = sourceIndex !== undefined;
    this.components = [];
  }

  async setupComponents(getGlyphFunc, parentLocation) {
    this.components = [];
    for (const compo of this.instance.components) {
      const compoController = new ComponentController(compo);
      await compoController.setupPath(getGlyphFunc, parentLocation);
      this.components.push(compoController);
    }
  }

  get xAdvance() {
    return this.instance.xAdvance;
  }

  get yAdvance() {
    return this.instance.yAdvance;
  }

  get verticalOrigin() {
    return this.instance.verticalOrigin;
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

  async setupPath(getGlyphFunc, parentLocation) {
    this.path = await flattenComponent(this.compo, getGlyphFunc, parentLocation);
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

async function flattenComponent(compo, getGlyphFunc, parentLocation) {
  return await joinPathsAsync(
    iterFlattenedComponentPaths(compo, getGlyphFunc, parentLocation)
  );
}

async function* iterFlattenedComponentPaths(
  compo,
  getGlyphFunc,
  parentLocation,
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

  const compoLocation = mergeLocations(parentLocation, compo.location) || {};
  const glyph = await getGlyphFunc(compo.name);
  let inst;
  if (!glyph) {
    // console.log(`component glyph ${compo.name} was not found`);
    inst = makeMissingComponentPlaceholderGlyph();
  } else {
    try {
      inst = await glyph.instantiate(
        normalizeLocation(compoLocation, glyph.combinedAxes),
        getGlyphFunc
      );
    } catch (error) {
      if (error.name !== "VariationError") {
        throw error;
      }
      const errorMessage = `Interpolation error while instantiating component ${
        compo.name
      } (${error.toString()})`;
      console.log(errorMessage);
      return;
    }
    if (!inst.path.numPoints && !inst.components.length) {
      inst = makeEmptyComponentPlaceholderGlyph();
    }
  }
  let t = makeAffineTransform(compo.transformation);
  if (transformation) {
    t = transformation.transform(t);
  }
  const componentPaths = {};
  if (inst.path.numPoints) {
    yield inst.path.transformed(t);
  }
  for (const subCompo of inst.components) {
    yield* iterFlattenedComponentPaths(
      subCompo,
      getGlyphFunc,
      compoLocation,
      t,
      seenGlyphNames
    );
  }
  seenGlyphNames.delete(compo.name);
}

export async function decomposeComponents(
  components,
  componentIndices,
  parentLocation,
  getGlyphFunc
) {
  if (!componentIndices) {
    componentIndices = range(instance.components.length);
  }

  const newPaths = [];
  const newComponents = [];
  for (const index of componentIndices) {
    const component = components[index];
    const baseGlyph = await getGlyphFunc(component.name);
    if (!baseGlyph) {
      // Missing base glyph
      continue;
    }
    let location = { ...parentLocation, ...component.location };
    const normLocation = baseGlyph.mapLocationGlobalToLocal(location);
    const compoInstance = await baseGlyph.instantiate(
      normalizeLocation(normLocation, baseGlyph.combinedAxes),
      getGlyphFunc
    );
    const t = makeAffineTransform(component.transformation);
    newPaths.push(compoInstance.path.transformed(t));
    for (const nestedCompo of compoInstance.components) {
      const nestedT = makeAffineTransform(nestedCompo.transformation);
      const newNestedT = t.transform(nestedT);
      newComponents.push({
        name: nestedCompo.name,
        transformation: decomposeAffineTransform(newNestedT),
        location: { ...nestedCompo.location },
      });
    }
  }
  const newPath = joinPaths(newPaths);
  return { path: newPath, components: newComponents };
}

function makeAxisMapFunc(axis) {
  if (!axis.mapping) {
    return (v) => v;
  }
  const mapping = Object.fromEntries(axis.mapping);
  return (v) => piecewiseLinearMap(v, mapping);
}

function sparsifyLocation(location) {
  // location must be normalized
  const sparseLocation = {};
  for (const [name, value] of Object.entries(location)) {
    if (value) {
      sparseLocation[name] = value;
    }
  }
  return sparseLocation;
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
    return loc2;
  }
  return { ...loc1, ...loc2 };
}

function decomposeAffineTransform(affine) {
  // Decompose a 2x2 transformation matrix into components:
  // - rotation
  // - scaleX
  // - scaleY
  // - skewX
  // - skewY
  const [a, b, c, d] = [affine.xx, affine.xy, affine.yx, affine.yy];
  const delta = a * d - b * c;

  let rotation = 0;
  let scaleX = 0,
    scaleY = 0;
  let skewX = 0,
    skewY = 0;

  // Apply the QR-like decomposition.
  if (a != 0 || b != 0) {
    const r = Math.sqrt(a * a + b * b);
    rotation = b > 0 ? Math.acos(a / r) : -Math.acos(a / r);
    [scaleX, scaleY] = [r, delta / r];
    [skewX, skewY] = [Math.atan((a * c + b * d) / (r * r)), 0];
  } else if (c != 0 || d != 0) {
    const s = Math.sqrt(c * c + d * d);
    rotation = Math.PI / 2 - (d > 0 ? Math.acos(-c / s) : -Math.acos(c / s));
    [scaleX, scaleY] = [delta / s, s];
    [skewX, skewY] = [0, Math.atan((a * c + b * d) / (s * s))];
  } else {
    // a = b = c = d = 0
  }

  const transformation = {
    translateX: affine.dx,
    translateY: affine.dy,
    rotation: rotation * (180 / Math.PI),
    scaleX: scaleX,
    scaleY: scaleY,
    skewX: -skewX * (180 / Math.PI),
    skewY: skewY * (180 / Math.PI),
    tCenterX: 0,
    tCenterY: 0,
  };
  return transformation;
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

function findNearestSourceIndexFromLocation(
  glyph,
  location,
  axes,
  skipInactive = false
) {
  const distances = [];
  if (!glyph.sources.length) {
    throw Error("assert -- glyph has no sources");
  }
  for (let i = 0; i < glyph.sources.length; i++) {
    const source = glyph.sources[i];
    if (skipInactive && source.inactive) {
      continue;
    }
    const sourceLocation = normalizeLocation(source.location, axes);
    let distanceSquared = 0;
    for (const [axisName, value] of Object.entries(location)) {
      const sourceValue = sourceLocation[axisName];
      distanceSquared += (sourceValue - value) ** 2;
    }
    if (distanceSquared === 0) {
      // exact match, no need to look further
      return { distance: 0, index: i };
    }
    distances.push([distanceSquared, i]);
  }
  distances.sort((a, b) => {
    const da = a[0];
    const db = b[0];
    return (a > b) - (a < b);
  });
  return { distance: Math.sqrt(distances[0][0]), index: distances[0][1] };
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

async function ensureComponentCompatibility(glyphs, getGlyphFunc) {
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
      },
      true // noCopy
    )
  );
}

function stripComponentLocations(glyph) {
  if (!glyph.components.length) {
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
    },
    true // noCopy
  );
}
