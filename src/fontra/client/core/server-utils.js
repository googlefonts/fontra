import { memoize } from "./utils.js";
import { VarPackedPath } from "./var-path.js";

export async function callServerAPI(functionName, kwargs) {
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

export const getSuggestedGlyphName = memoize(async (codePoint) => {
  return await callServerAPI("getSuggestedGlyphName", { codePoint });
});

export const getCodePointFromGlyphName = memoize(async (glyphName) => {
  return await callServerAPI("getCodePointFromGlyphName", { glyphName });
});

export async function parseClipboard(data) {
  return await callServerAPI("parseClipboard", { data });
}

export async function unionPath(path) {
  const newPath = await callServerAPI("unionPath", { path });
  return VarPackedPath.fromObject(newPath);
}

export async function subtractPath(pathA, pathB) {
  const newPath = await callServerAPI("subtractPath", { pathA, pathB });
  return VarPackedPath.fromObject(newPath);
}

export async function intersectPath(pathA, pathB) {
  const newPath = await callServerAPI("intersectPath", { pathA, pathB });
  return VarPackedPath.fromObject(newPath);
}

export async function excludePath(pathA, pathB) {
  const newPath = await callServerAPI("excludePath", { pathA, pathB });
  return VarPackedPath.fromObject(newPath);
}
