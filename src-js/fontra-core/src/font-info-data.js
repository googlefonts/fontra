import { NumberFormatter } from "@fontra/core/ui-utils.js";
import {
  ArrayFormatter,
  BooleanFormatter,
  FixedLengthArrayFormatter,
} from "./formatters.js";

// NOTE: fontObject can be FontInfo or FontSource
function getAscenderDefault(fontObject = undefined) {
  return fontObject.lineMetricsHorizontalLayout?.ascender.value || 800;
}

function getDescenderDefault(fontObject = undefined) {
  return fontObject.lineMetricsHorizontalLayout?.descender.value || -200;
}

function getFamilyNameDefault(fontObject = undefined) {
  return fontObject.familyName || "Family Name";
}

function getSubfamilyNameDefault(fontObject = undefined) {
  return fontObject.name || "Subfamily Name";
}

function getVersionNameDefault(fontObject = undefined) {
  return fontObject.versionMajor
    ? `Version ${fontObject.versionMajor}.${fontObject.versionMinor}`
    : "Version 1.0";
}

function getStrikeoutPositionDefault(fontObject = undefined) {
  return fontObject.lineMetricsHorizontalLayout?.ascender.value / 2 || 250;
}

function getCreatedDefault() {
  // Note: UTC might differ from your local time.
  const date = new Date();

  const YYYY = date.getUTCFullYear();
  const MM = String(date.getUTCMonth() + 1).padStart(2, "0");
  const DD = String(date.getUTCDate()).padStart(2, "0");

  const HH = String(date.getUTCHours()).padStart(2, "0");
  const mm = String(date.getUTCMinutes()).padStart(2, "0");
  const SS = String(date.getUTCSeconds()).padStart(2, "0");

  return `${YYYY}/${MM}/${DD} ${HH}:${mm}:${SS}`;
}

export const customDataCollection = [
  // vertical metrics values
  {
    key: "openTypeHheaAscender",
    getDefaultFunction: getAscenderDefault,
    formatter: NumberFormatter,
    info: "Ascender value must be Integer.\nCorresponds to the OpenType hhea table `Ascender` field.",
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-hhea-table-fields",
  },
  {
    key: "openTypeHheaDescender",
    getDefaultFunction: getDescenderDefault,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeHheaLineGap",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeOS2TypoAscender",
    getDefaultFunction: getAscenderDefault,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeOS2TypoDescender",
    getDefaultFunction: getDescenderDefault,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeOS2TypoLineGap",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeOS2WinAscent",
    getDefaultFunction: getAscenderDefault,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeOS2WinDescent",
    getDefaultFunction: (fontSource) => getDescenderDefault(fontSource) * -1,
    formatter: NumberFormatter,
  },
  {
    key: "postscriptUnderlinePosition",
    getDefaultFunction: () => -100,
    formatter: NumberFormatter,
  },
  {
    key: "postscriptUnderlineThickness",
    getDefaultFunction: () => 50,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeOS2StrikeoutPosition",
    getDefaultFunction: getStrikeoutPositionDefault,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeOS2StrikeoutSize",
    getDefaultFunction: () => 50,
    formatter: NumberFormatter,
  },
  // name table entries
  {
    key: "openTypeNameUniqueID",
    getDefaultFunction: () => "Unique ID Name ID 3",
    info: "Name ID 3",
  },

  {
    key: "openTypeNameVersion",
    getDefaultFunction: getVersionNameDefault,
    info: "Name ID 7",
  },
  {
    key: "openTypeNamePreferredFamilyName",
    getDefaultFunction: getFamilyNameDefault,
    info: "Name ID 16",
  },
  {
    key: "openTypeNamePreferredSubfamilyName",
    getDefaultFunction: getSubfamilyNameDefault,
    info: "Name ID 17",
  },
  {
    key: "openTypeNameCompatibleFullName",
    getDefaultFunction: () => "Compatible Full Name",
    info: "Name ID 18",
  },

  {
    key: "openTypeNameWWSFamilyName",
    getDefaultFunction: getFamilyNameDefault,
    info: "Name ID 21",
  },

  {
    key: "openTypeNameWWSSubfamilyName",
    getDefaultFunction: getSubfamilyNameDefault,
    info: "Name ID 22",
  },
  // misc
  {
    key: "openTypeOS2WeightClass",
    getDefaultFunction: () => 400,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeOS2WidthClass",
    getDefaultFunction: () => 5,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeHeadCreated",
    getDefaultFunction: getCreatedDefault,
    info: `"YYYY/MM/DD HH:MM:SS"\nThe timezone is UTC and might differ to your local time.`,
  },
  {
    key: "openTypeOS2Selection",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
    info: "7 = Use Typo Metrics, 8 = has WWS name", // https://github.com/fonttools/fonttools/blob/598b974f87f35972da24e96e45bd0176d18930a0/Lib/fontTools/ufoLib/__init__.py#L1889
  },
  {
    key: "openTypeOS2Type",
    getDefaultFunction: () => [3],
    formatter: ArrayFormatter,
    info: `Font embedding bit:\n2 = "Preview & Print embedding"\n3 = "Editable embedding" (default)`,
  },
  {
    key: "openTypeOS2Panose",
    getDefaultFunction: () => [2, 11, 5, 2, 4, 5, 4, 2, 2, 4],
    formatter: FixedLengthArrayFormatter(10),
    info: "Panose must be an list fo 10 numbers.\n[2, 11, 5, 2, 4, 5, 4, 2, 2, 4] -> default: sans-serif",
  },
  {
    key: "openTypeOS2FamilyClass",
    getDefaultFunction: () => [8, 0],
    formatter: FixedLengthArrayFormatter(2),
    info: "OS/2 FamilyClass must be a list of 2: Class + Subclass.\nDefault -> [8, 0]\nClass ID 8 = Sans Serif\nSubclass ID = 0: No Classification",
  },
  {
    key: "openTypeOS2UnicodeRanges",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
  },
  {
    key: "openTypeOS2CodePageRanges",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
  },
  // Postscript Font Level Hints,
  // https://adobe-type-tools.github.io/font-tech-notes/pdfs/T1_SPEC.pdf
  {
    key: "postscriptBlueValues",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
  },
  {
    key: "postscriptOtherBlues",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
  },
  {
    key: "postscriptFamilyBlues",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
  },
  {
    key: "postscriptFamilyOtherBlues",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
  },
  {
    key: "postscriptBlueScale",
    getDefaultFunction: () => 0.039625,
    formatter: NumberFormatter,
    info: "0.039625 -> default\nReference:\nhttps://adobe-type-tools.github.io/font-tech-notes/pdfs/T1_SPEC.pdf",
  },
  {
    key: "postscriptBlueShift",
    getDefaultFunction: () => 1,
    formatter: NumberFormatter,
  },
  {
    key: "postscriptBlueFuzz",
    getDefaultFunction: () => 1,
    formatter: NumberFormatter,
  },
  {
    key: "postscriptStemSnapH",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
  },
  {
    key: "postscriptStemSnapV",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
  },
  {
    key: "postscriptForceBold",
    getDefaultFunction: () => false,
    formatter: BooleanFormatter,
  },
  // PostScript Specific Data
  // postscriptFontName // NOTE: not in ufoInfoAttributesToRoundTrip
  // postscriptFullName // NOTE: not in ufoInfoAttributesToRoundTrip
  {
    key: "postscriptSlantAngle",
    getDefaultFunction: () => 0.0,
    formatter: NumberFormatter,
  },
  {
    key: "postscriptUniqueID",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "postscriptWeightName",
    getDefaultFunction: () => "postscriptWeightName",
  },
  {
    key: "postscriptIsFixedPitch",
    getDefaultFunction: () => false,
    formatter: BooleanFormatter,
    info: "Indicates if the font is monospaced.",
  },
  {
    key: "postscriptDefaultWidthX",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "postscriptNominalWidthX",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "postscriptDefaultCharacter",
    getDefaultFunction: () => "glyphName",
    info: "The name of the glyph that should be used as the default character in PFM files.",
  },
  {
    key: "postscriptWindowsCharacterSet",
    getDefaultFunction: () => 2,
    formatter: NumberFormatter,
    info: "2 = Default",
  },
  // OpenType vhea Table Fields
  // openTypeVheaVertTypoAscender  // NOTE: part of lineMetricsVerMapping
  // openTypeVheaVertTypoDescender  // NOTE: part of lineMetricsVerMapping
  {
    key: "openTypeVheaVertTypoLineGap",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeVheaCaretSlopeRise",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeVheaCaretSlopeRun",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeVheaCaretOffset",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  // OpenType hhea Table Fields
  {
    key: "openTypeHheaCaretSlopeRise",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeHheaCaretSlopeRun",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeHheaCaretOffset",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  // OpenType OS/2 Table Fields
  {
    key: "openTypeOS2SubscriptXSize",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeOS2SubscriptYSize",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeOS2SubscriptXOffset",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeOS2SubscriptYOffset",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeOS2SuperscriptXSize",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeOS2SuperscriptYSize",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeOS2SuperscriptXOffset",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  {
    key: "openTypeOS2SuperscriptYOffset",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
  },
  // OpenType OS/2 Table Fields
  {
    key: "openTypeHeadLowestRecPPEM",
    getDefaultFunction: () => 6,
    formatter: NumberFormatter,
    info: "Smallest readable size in pixels.",
  },
  {
    key: "openTypeHeadFlags",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
  },
];

// TODO: Based on ufoInfoAttributesToRoundTrip (designspace.py)
//   "openTypeGaspRangeRecords", // TODO: This is more complex, please see: https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-gasp-table-fields
//   "openTypeNameRecords", // TODO: This is more complex, please see: https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#name-record-format

export function getCustomDataInfoFromKey(key, customDataInfos) {
  if (customDataInfos == undefined) {
    customDataInfos = customDataCollection;
  }
  const mapping = customDataInfos.find((customDataInfo) => customDataInfo.key === key);
  return mapping ? mapping : undefined;
}
