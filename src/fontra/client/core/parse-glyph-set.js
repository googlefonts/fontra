import { getCodePointFromGlyphName } from "./glyph-data.js";

export const glyphSetDataFormats = [
  { value: "auto-detect", label: "auto-detect" },
  { value: "glyph-names", label: "Glyph names (whitespace-separated)" },
  { value: "csv", label: "CSV (comma- or semicolon-separated)" },
  { value: "tsv", label: "TSV (tab-separated)" },
];

export function parseGlyphSet(sourceData, dataFormat) {
  sourceData = sourceData.replaceAll("\r\n", "\n"); // normalize line endings

  // TODO: TSV/CSV, etc.

  const glyphSet = [];
  for (let line of sourceData.split("\n")) {
    const commentIndex = line.indexOf("#");
    if (commentIndex >= 0) {
      line = line.slice(0, commentIndex);
    }
    line = line.trim();
    if (!line) {
      continue;
    }

    for (const glyphName of line.split(/\s+/)) {
      const codePoint = getCodePointFromGlyphName(glyphName);
      glyphSet.push({ glyphName, codePoints: codePoint ? [codePoint] : [] });
    }
  }

  return glyphSet;
}
