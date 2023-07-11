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

// TODO: memoize getSuggestedGlyphName and getUnicodeFromGlyphName

export async function getSuggestedGlyphName(codePoint) {
  return await callServerAPI("getSuggestedGlyphName", { codePoint });
}

export async function getUnicodeFromGlyphName(glyphName) {
  return await callServerAPI("getUnicodeFromGlyphName", { glyphName });
}

export async function parseClipboard(data) {
  return await callServerAPI("parseClipboard", { data });
}
