import { fetchJSON } from "./utils.js";
import { StaticGlyph } from "./var-glyph.js";

/**
 * @module fontra/client/core/backend-api
 * @description
 * This module provides a class that can be used to interact with the backend API.
 * The default Fontra backend is the Python-based web server. This class provides
 * an abstraction over the functionality of the web server, so that alternative
 * backends can be used.
 *
 * @typedef {import('./var-path.js').VarPackedPath} VarPackedPath
 */
class AbstractBackend {
  /**
   * Get a list of projects from the backend.
   * @returns {Promise<string[]>} An array of project names.
   */
  static async getProjects() {}

  /**
   * Get a suggested glyph name for a given code point.
   * @param {number} codePoint - The code point.
   * @returns {Promise<string>} The suggested glyph name.
   */
  static async getSuggestedGlyphName(codePoint) {}

  /**
   * Get the code point for a given glyph name.
   * @param {string} glyphName - The glyph name.
   * @returns {Promise<number>} The code point.
   */
  static async getCodePointFromGlyphName(glyphName) {}

  /**
   * Parse clipboard data.
   *
   * Returns a glyph object parsed from either a SVG string or an UFO .glif.
   * @param {string} data - The clipboard data.
   * @returns {Promise<StaticGlyph>} - The glyph object, if parsable.
   */
  static async parseClipboard(data) {}

  /**
   * Remove overlaps in a path
   *
   * In this and all following functions, the paths are represented as
   * JSON VarPackedPath objects; i.e. they have `coordinates`, `pointTypes`,
   * `contourInfo`, and `pointAttrbutes` fields.
   *
   * @param {VarPackedPath} path - The first path.
   * @returns {Promise<VarPackedPath>} The union of the two paths.
   */
  static async unionPath(path) {}

  /**
   * Subtract one path from another.
   * @param {VarPackedPath} pathA - The first path.
   * @param {VarPackedPath} pathB - The second path.
   * @returns {Promise<VarPackedPath>} The difference of the two paths.
   */
  static async subtractPath(pathA, pathB) {}

  /**
   * Intersect two paths.
   * @param {VarPackedPath} pathA - The first path.
   * @param {VarPackedPath} pathB - The second path.
   * @returns {Promise<VarPackedPath>} The intersection of the two paths.
   */
  static async intersectPath(pathA, pathB) {}

  /**
   * Exclude one path from another.
   * @param {VarPackedPath} pathA - The first path.
   * @param {VarPackedPath} pathB - The second path.
   * @returns {Promise<VarPackedPath>} The exclusion of the two paths.
   */
  static async excludePath(pathA, pathB) {}
}

class PythonBackend extends AbstractBackend {
  static async getProjects() {
    return fetchJSON("/projectlist");
  }

  static async _callServerAPI(functionName, kwargs) {
    const response = await fetch(`/api/${functionName}`, {
      method: "POST",
      body: JSON.stringify(kwargs),
    });

    const result = await response.json();
    if (result.error) {
      throw new Error(result.error);
    }
    return result.returnValue;
  }

  static async getSuggestedGlyphName(codePoint) {
    return await this._callServerAPI("getSuggestedGlyphName", { codePoint });
  }

  static async getCodePointFromGlyphName(glyphName) {
    return await this._callServerAPI("getCodePointFromGlyphName", { glyphName });
  }

  static async parseClipboard(data) {
    let result = await this._callServerAPI("parseClipboard", { data });
    return result ? StaticGlyph.fromObject(result) : undefined;
  }

  static async unionPath(path) {
    const newPath = await this._callServerAPI("unionPath", { path });
    return VarPackedPath.fromObject(newPath);
  }

  static async subtractPath(pathA, pathB) {
    const newPath = await this._callServerAPI("subtractPath", { pathA, pathB });
    return VarPackedPath.fromObject(newPath);
  }

  static async intersectPath(pathA, pathB) {
    const newPath = await this._callServerAPI("intersectPath", { pathA, pathB });
    return VarPackedPath.fromObject(newPath);
  }

  static async excludePath(pathA, pathB) {
    const newPath = await this._callServerAPI("excludePath", { pathA, pathB });
    return VarPackedPath.fromObject(newPath);
  }
}

export const Backend = PythonBackend;
