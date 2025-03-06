import { NumberFormatter } from "@fontra/core/ui-utils.js";
import {
  ArrayFormatter,
  BooleanFormatter,
  PanoseArrayFormatter,
  FixedLengthArrayFormatter,
} from "./formatters.js";

// NOTE: fontObject can be FontInfo or FontSource
function getAscenderDefault(fontObject = undefined) {
  return fontObject.lineMetricsHorizontalLayout?.ascender.value || 800;
}

function getDescenderDefault(fontObject = undefined) {
  return fontObject.lineMetricsHorizontalLayout?.descender.value || -200;
}

function getFamilyNameDefault(fontSource = undefined) {
  return fontSource.familyName || "Family Name";

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

  return `${YYYY}/${MM}/${DD} ${HH}:${mm}:${SS}`; // "YYYY/MM/DD HH:MM:SS"
}

export const customDataNameMapping = {
  // vertical metrics values
  openTypeHheaAscender: {
    default: getAscenderDefault,
    formatter: NumberFormatter,
    info: "Integer. Ascender value. Corresponds to the OpenType hhea table `Ascender` field.",
  },
  openTypeHheaDescender: { default: getDescenderDefault, formatter: NumberFormatter },
  openTypeHheaLineGap: { default: () => 0, formatter: NumberFormatter },
  openTypeOS2TypoAscender: { default: getAscenderDefault, formatter: NumberFormatter },
  openTypeOS2TypoDescender: {
    default: getDescenderDefault,
    formatter: NumberFormatter,
  },
  openTypeOS2TypoLineGap: { default: () => 0, formatter: NumberFormatter },
  openTypeOS2WinAscent: { default: getAscenderDefault, formatter: NumberFormatter },
  openTypeOS2WinDescent: {
    default: (fontSource) => getDescenderDefault(fontSource) * -1,
    formatter: NumberFormatter,
  },
  postscriptUnderlinePosition: { default: () => -100, formatter: NumberFormatter },
  postscriptUnderlineThickness: { default: () => 50, formatter: NumberFormatter },
  openTypeOS2StrikeoutPosition: {
    default: getStrikeoutPositionDefault,
    formatter: NumberFormatter,
  },
  openTypeOS2StrikeoutSize: { default: () => 50, formatter: NumberFormatter },
  // name table entries
  openTypeNameUniqueID: { default: () => "Unique ID Name ID 3" }, // Name ID 3
  openTypeNameVersion: { default: getVersionNameDefault }, // Name ID 7
  openTypeNamePreferredFamilyName: { default: getFamilyNameDefault }, // Name ID 16
  openTypeNamePreferredSubfamilyName: { default: getSubfamilyNameDefault }, // Name ID 17
  openTypeNameCompatibleFullName: { default: () => "Compatible Full Name" }, // Name ID 18
  openTypeNameWWSFamilyName: { default: getFamilyNameDefault }, // Name ID 21
  openTypeNameWWSSubfamilyName: { default: getSubfamilyNameDefault }, // Name ID 22
  // misc
  openTypeOS2WeightClass: { default: () => 400, formatter: NumberFormatter },
  openTypeOS2WidthClass: { default: () => 5, formatter: NumberFormatter },
  openTypeHeadCreated: { default: getCreatedDefault }, // The timezone is UTC.
  openTypeOS2Selection: { default: () => [], formatter: ArrayFormatter }, // 7 = Use Typo Metrics, 8 = has WWS name, https://github.com/fonttools/fonttools/blob/598b974f87f35972da24e96e45bd0176d18930a0/Lib/fontTools/ufoLib/__init__.py#L1889
  openTypeOS2Type: {
    default: () => [3],
    formatter: ArrayFormatter,
    info: `Font embedding bit:\n2 = "Preview & Print embedding"\n3 = "Editable embedding" (default)`,
  },
  openTypeOS2Panose: {
    default: () => [2, 11, 5, 2, 4, 5, 4, 2, 2, 4],
    formatter: PanoseArrayFormatter,
  }, // default: sans-serif
  openTypeOS2FamilyClass: { default: () => [8, 0], formatter: ArrayFormatter }, // Class ID 8 = Sans Serif, Subclass ID = 0: No Classification
  openTypeOS2UnicodeRanges: { default: () => [], formatter: ArrayFormatter },
  openTypeOS2CodePageRanges: { default: () => [], formatter: ArrayFormatter },
  // Postscript Font Level Hints, // https://adobe-type-tools.github.io/font-tech-notes/pdfs/T1_SPEC.pdf
  postscriptBlueValues: { default: () => [], formatter: ArrayFormatter },
  postscriptOtherBlues: { default: () => [], formatter: ArrayFormatter },
  postscriptFamilyBlues: { default: () => [], formatter: ArrayFormatter },
  postscriptFamilyOtherBlues: { default: () => [], formatter: ArrayFormatter },
  postscriptBlueScale: { default: () => 0.039625, formatter: NumberFormatter },
  postscriptBlueShift: { default: () => 1, formatter: NumberFormatter },
  postscriptBlueFuzz: { default: () => 1, formatter: NumberFormatter },
  postscriptStemSnapH: { default: () => [], formatter: ArrayFormatter },
  postscriptStemSnapV: { default: () => [], formatter: ArrayFormatter },
  postscriptForceBold: { default: () => false, formatter: BooleanFormatter },
  // PostScript Specific Data
  // postscriptFontName // NOTE: not in ufoInfoAttributesToRoundTrip
  // postscriptFullName // NOTE: not in ufoInfoAttributesToRoundTrip
  postscriptSlantAngle: { default: () => 0.0, formatter: NumberFormatter },
  postscriptUniqueID: { default: () => 0, formatter: NumberFormatter },
  postscriptWeightName: { default: () => "postscriptWeightName" },
  postscriptIsFixedPitch: { default: () => false, formatter: BooleanFormatter }, // Indicates if the font is monospaced.
  postscriptDefaultWidthX: { default: () => 0, formatter: NumberFormatter },
  postscriptNominalWidthX: { default: () => 0, formatter: NumberFormatter },
  postscriptDefaultCharacter: { default: () => "glyphName" }, // The name of the glyph that should be used as the default character in PFM files.
  postscriptWindowsCharacterSet: { default: () => 2, formatter: NumberFormatter }, // 2 = Default
  // OpenType vhea Table Fields
  // openTypeVheaVertTypoAscender  // NOTE: part of lineMetricsVerMapping
  // openTypeVheaVertTypoDescender  // NOTE: part of lineMetricsVerMapping
  openTypeVheaVertTypoLineGap: { default: () => 0, formatter: NumberFormatter },
  openTypeVheaCaretSlopeRise: { default: () => 0, formatter: NumberFormatter },
  openTypeVheaCaretSlopeRun: { default: () => 0, formatter: NumberFormatter },
  openTypeVheaCaretOffset: { default: () => 0, formatter: NumberFormatter },
  // OpenType hhea Table Fields
  openTypeHheaCaretSlopeRise: { default: () => 0, formatter: NumberFormatter },
  openTypeHheaCaretSlopeRun: { default: () => 0, formatter: NumberFormatter },
  openTypeHheaCaretOffset: { default: () => 0, formatter: NumberFormatter },
  // OpenType OS/2 Table Fields
  openTypeOS2SubscriptXSize: { default: () => 0, formatter: NumberFormatter },
  openTypeOS2SubscriptYSize: { default: () => 0, formatter: NumberFormatter },
  openTypeOS2SubscriptXOffset: { default: () => 0, formatter: NumberFormatter },
  openTypeOS2SubscriptYOffset: { default: () => 0, formatter: NumberFormatter },
  openTypeOS2SuperscriptXSize: { default: () => 0, formatter: NumberFormatter },
  openTypeOS2SuperscriptYSize: { default: () => 0, formatter: NumberFormatter },
  openTypeOS2SuperscriptXOffset: { default: () => 0, formatter: NumberFormatter },
  openTypeOS2SuperscriptYOffset: { default: () => 0, formatter: NumberFormatter },
  // OpenType OS/2 Table Fields
  openTypeHeadLowestRecPPEM: { default: () => 6, formatter: NumberFormatter }, // Smallest readable size in pixels.
  openTypeHeadFlags: { default: () => [], formatter: ArrayFormatter },
};

// TODO: Based on ufoInfoAttributesToRoundTrip (designspace.py)
//   "openTypeGaspRangeRecords", // TODO: This is more complex, please see: https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-gasp-table-fields
//   "openTypeNameRecords", // TODO: This is more complex, please see: https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#name-record-format
