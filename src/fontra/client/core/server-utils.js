import { memoize } from "./utils.js";

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

export const getUnicodeFromGlyphName = memoize(async (glyphName) => {
  return await callServerAPI("getUnicodeFromGlyphName", { glyphName });
});

export async function parseClipboard(data) {
  return await callServerAPI("parseClipboard", { data });
}
