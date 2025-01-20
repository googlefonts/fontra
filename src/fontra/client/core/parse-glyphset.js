import { getCodePointFromGlyphName, getSuggestedGlyphName } from "./glyph-data.js";

export const glyphSetDataFormats = [
  {
    value: "glyph-names",
    label: "Glyph names (whitespace-separated)",
  },
  {
    value: "tsv/csv",
    label: "TSV or CSV (tab-, comma-, or semicolon-separated)",
  },
];

export function parseGlyphSet(sourceData, dataFormat, dataOptions) {
  const sourceLines = sourceData.split(/\r?\n/);

  const isTableFormat = dataFormat === "tsv/csv";
  if (!isTableFormat && dataFormat !== "glyph-names") {
    console.log("unknown data format:", dataFormat);
  }

  let tableHeader;
  let glyphNameColumnIndex = parseInt(dataOptions.glyphNameColumn);
  let codePointColumnIndex = parseInt(dataOptions.codePointColumn);
  if (!dataOptions.hasHeader) {
    // If we don't have a header, we should at least have an index for the
    // code point column OR the glyph name column
    assert(!(isNaN(glyphNameColumnIndex) && isNaN(codePointColumnIndex)));
  }

  const glyphSet = [];
  for (let line of sourceLines) {
    line = stripLineComments(line, dataOptions?.commentChars);

    if (dataFormat === "glyph-names") {
      line = line.trim();
      if (!line) {
        continue;
      }

      for (const glyphName of line.split(/\s+/)) {
        const codePoint = getCodePointFromGlyphName(glyphName);
        glyphSet.push({ glyphName, codePoints: codePoint ? [codePoint] : [] });
      }
    } else if (dataFormat === "tsv/csv") {
      const row = line.split(/\t|,|;/).map((item) => item.trim());
      if (!tableHeader && dataOptions.hasHeader) {
        tableHeader = row;

        if (isNaN(glyphNameColumnIndex) && dataOptions.glyphNameColumn) {
          glyphNameColumnIndex = tableHeader.indexOf(dataOptions.glyphNameColumn);
          if (glyphNameColumnIndex < 0) {
            throw new Error(`invalid glyphNameColumn: ${dataOptions.glyphNameColumn}`);
          }
        }

        if (isNaN(codePointColumnIndex) && dataOptions.codePointColumn) {
          codePointColumnIndex = tableHeader.indexOf(dataOptions.codePointColumn);
          if (codePointColumnIndex < 0) {
            throw new Error(`invalid codePointColumn: ${dataOptions.codePointColumn}`);
          }
        }
        continue;
      }

      const glyphName = row[glyphNameColumnIndex];

      let codePointCell = row[codePointColumnIndex];
      let codePoint;
      if (codePointCell) {
        if (dataOptions.codePointIsDecimal) {
          codePoint = parseInt(codePointCell);
        } else {
          // Hex
          if (codePointCell.startsWith("U+") || codePointCell.startsWith("0x")) {
            codePointCell = codePointCell.slice(2);
          }
          codePoint = parseInt(codePointCell, 16);
        }
      }

      if (!glyphName && !codePoint) {
        continue;
      }
      if (!glyphName) {
        glyphName = getSuggestedGlyphName(codePoint);
      } else if (!codePoint) {
        codePoint = getCodePointFromGlyphName(glyphName);
      }

      glyphSet.push({ glyphName, codePoints: codePoint ? [codePoint] : [] });
    }
  }

  return glyphSet;
}

function stripLineComments(line, commentChars) {
  for (const commentChar of commentChars || "") {
    const commentIndex = line.indexOf(commentChar);
    if (commentIndex >= 0) {
      line = line.slice(0, commentIndex);
    }
  }
  return line;
}
