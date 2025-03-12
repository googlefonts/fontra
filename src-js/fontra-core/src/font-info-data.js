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
    info: "Ascender value must be integer. Corresponds to the OpenType hhea table Ascender field.",
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-hhea-table-fields",
  },
  {
    key: "openTypeHheaDescender",
    getDefaultFunction: getDescenderDefault,
    formatter: NumberFormatter,
    info: "Descender value must be integer. Corresponds to the OpenType hhea table Descender field.",
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-hhea-table-fields",
  },
  {
    key: "openTypeHheaLineGap",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: "Line gap value must be integer. Default -> 0. Corresponds to the OpenType hhea table LineGap field.",
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-hhea-table-fields",
  },
  {
    key: "openTypeOS2TypoAscender",
    getDefaultFunction: getAscenderDefault,
    formatter: NumberFormatter,
    info: "Ascender value must be integer. Corresponds to the OpenType OS/2 table sTypoAscender field.",
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-os2-table-fields",
  },
  {
    key: "openTypeOS2TypoDescender",
    getDefaultFunction: getDescenderDefault,
    formatter: NumberFormatter,
    info: "Descender value must be integer. Corresponds to the OpenType OS/2 table sTypoDescender field.",
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-os2-table-fields",
  },
  {
    key: "openTypeOS2TypoLineGap",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: "Line gap value must be integer. Default -> 0. Corresponds to the OpenType OS/2 table sTypoLineGap field.",
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-os2-table-fields",
  },
  {
    key: "openTypeOS2WinAscent",
    getDefaultFunction: getAscenderDefault,
    formatter: NumberFormatter,
    info: "Ascender value must be integer. Corresponds to the OpenType OS/2 table usWinAscent field.",
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-os2-table-fields",
  },
  {
    key: "openTypeOS2WinDescent",
    getDefaultFunction: (fontSource) => getDescenderDefault(fontSource) * -1,
    formatter: NumberFormatter,
    info: "Descender value must be integer. Corresponds to the OpenType OS/2 table usWinDescent field.",
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-os2-table-fields",
  },
  {
    key: "postscriptUnderlinePosition",
    getDefaultFunction: () => -100,
    formatter: NumberFormatter,
    info: "Underline position value must be integer or float. Corresponds to the Type 1/CFF/post table UnderlinePosition field.",
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#postscript-specific-data",
  },
  {
    key: "postscriptUnderlineThickness",
    getDefaultFunction: () => 50,
    formatter: NumberFormatter,
    info: "Underline thickness value must be integer or float. Corresponds to the Type 1/CFF/post table UnderlineThickness field.",
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#postscript-specific-data",
  },
  {
    key: "openTypeOS2StrikeoutPosition",
    getDefaultFunction: getStrikeoutPositionDefault,
    formatter: NumberFormatter,
    info: "Strikeout position must be integer. Corresponds to the OpenType OS/2 table yStrikeoutPosition field.",
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-os2-table-fields",
  },
  {
    key: "openTypeOS2StrikeoutSize",
    getDefaultFunction: () => 50,
    formatter: NumberFormatter,
    info: "Strikeout size must be integer. Corresponds to the OpenType OS/2 table yStrikeoutSize field.",
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-os2-table-fields",
  },
  // name table entries
  {
    key: "openTypeNameUniqueID",
    getDefaultFunction: () => "Unique ID Name ID 3",
    info: "Unique ID string. Corresponds to the OpenType name table name ID 3.",
    infoLink: "https://learn.microsoft.com/en-us/typography/opentype/spec/name#nid3",
  },

  {
    key: "openTypeNameVersion",
    getDefaultFunction: getVersionNameDefault,
    info: "Version string. Corresponds to the OpenType name table name ID 5.",
    infoLink: "https://learn.microsoft.com/en-us/typography/opentype/spec/name#nid5",
  },
  {
    key: "openTypeNamePreferredFamilyName",
    getDefaultFunction: getFamilyNameDefault,
    info: "Preferred family name. Corresponds to the OpenType name table name ID 16.",
    infoLink: "https://learn.microsoft.com/en-us/typography/opentype/spec/name#nid16",
  },
  {
    key: "openTypeNamePreferredSubfamilyName",
    getDefaultFunction: getSubfamilyNameDefault,
    info: "Preferred subfamily name. Corresponds to the OpenType name table name ID 17.",
    infoLink: "https://learn.microsoft.com/en-us/typography/opentype/spec/name#nid17",
  },
  {
    key: "openTypeNameCompatibleFullName",
    getDefaultFunction: () => "Compatible Full Name",
    info: "Compatible full name. Corresponds to the OpenType name table name ID 18.",
    infoLink: "https://learn.microsoft.com/en-us/typography/opentype/spec/name#nid18",
  },

  {
    key: "openTypeNameWWSFamilyName",
    getDefaultFunction: getFamilyNameDefault,
    info: "WWS family name. Corresponds to the OpenType name table name ID 21.",
    infoLink: "https://learn.microsoft.com/en-us/typography/opentype/spec/name#nid21",
  },

  {
    key: "openTypeNameWWSSubfamilyName",
    getDefaultFunction: getSubfamilyNameDefault,
    info: "WWS Subfamily name. Corresponds to the OpenType name table name ID 22.",
    infoLink: "https://learn.microsoft.com/en-us/typography/opentype/spec/name#nid22",
  },
  // misc
  {
    key: "openTypeOS2WeightClass",
    getDefaultFunction: () => 400,
    formatter: NumberFormatter,
    info: "Weight class value from 1 to 1000. Corresponds to the OpenType OS/2 table usWeightClass field.",
    infoLink:
      "https://learn.microsoft.com/en-us/typography/opentype/spec/os2#usweightclass",
  },
  {
    key: "openTypeOS2WidthClass",
    getDefaultFunction: () => 5,
    formatter: NumberFormatter,
    info: "Width class value. Must be in the range 1-9. Corresponds to the OpenType OS/2 table usWidthClass field.",
    infoLink:
      "https://learn.microsoft.com/en-us/typography/opentype/spec/os2#uswidthclass",
  },
  {
    key: "openTypeHeadCreated",
    getDefaultFunction: getCreatedDefault,
    info: `Creation date. Expressed as a string of the format “YYYY/MM/DD HH:MM:SS”. The timezone is UTC why it might differ to your local time.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-head-table-fields",
  },
  {
    key: "openTypeOS2Selection",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
    info: `A list of bit numbers indicating the bits that should be set in fsSelection. The bit numbers are listed in the OpenType OS/2 specification. Note: Bits 0 (italic), 5 (bold) and 6 (regular) must not be set here. These bits should be taken from the generic styleMapStyleName attribute.

    0 = Italic (should not be set)
    1 = Underscore
    2 = Negative
    3 = Outlined
    4 = Strikeout
    5 = Bold (should not be set)
    6 = Regular (should not be set)
    7 = Use Typo Metrics
    8 = has WWS name
    9 = Oblique`,
    infoLink:
      "https://learn.microsoft.com/en-us/typography/opentype/spec/os2#fsselection",
  },
  {
    key: "openTypeOS2Type",
    getDefaultFunction: () => [3],
    formatter: ArrayFormatter,
    info: `A list of bit numbers indicating the embedding type. The bit numbers are listed in the OpenType OS/2 specification. Corresponds to the OpenType OS/2 table fsType field.

    0 = Installable embedding
    1 = Restricted License embedding
    2 = Preview & Print embedding
    3 = Editable embedding (default)
    8 = No subsetting
    9 = Bitmap embedding only
    `,
    infoLink: "https://learn.microsoft.com/en-us/typography/opentype/spec/os2#fstype",
  },
  {
    key: "openTypeOS2Panose",
    getDefaultFunction: () => [2, 11, 5, 2, 4, 5, 4, 2, 2, 4],
    formatter: FixedLengthArrayFormatter(10),
    info: `The list must contain 10 non-negative integers that represent the setting for each category in the Panose specification. The integers correspond with the option numbers in each of the Panose categories. This corresponds to the OpenType OS/2 table Panose field.

    Default (sans-serif) -> [2, 11, 5, 2, 4, 5, 4, 2, 2, 4]`,
    infoLink: "https://monotype.github.io/panose/pan1.htm",
  },
  {
    key: "openTypeOS2FamilyClass",
    getDefaultFunction: () => [8, 0],
    formatter: FixedLengthArrayFormatter(2),
    info: `Two integers representing the IBM font class and font subclass of the font. The first number, representing the class ID, must be in the range 0-14. The second number, representing the subclass, must be in the range 0-15. The numbers are listed in the OpenType OS/2 specification. Corresponds to the OpenType OS/2 table sFamilyClass field.

    Default -> [8, 0]

    Class ID: 8 = Sans Serif
    Subclass ID: 0 = No Classification`,
    infoLink: "https://learn.microsoft.com/en-us/typography/opentype/spec/ibmfc",
  },
  {
    key: "openTypeOS2UnicodeRanges",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
    info: `A list of bit numbers indicating the Unicode ranges supported by the font. The bit numbers are listed in the OpenType OS/2 specification. Corresponds to the OpenType OS/2 table ulUnicodeRange fields.

    Default -> []`,
    infoLink:
      "https://learn.microsoft.com/en-us/typography/opentype/spec/os2#ulunicoderange",
  },
  {
    key: "openTypeOS2CodePageRanges",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
    info: `A list of bit numbers indicating the code page ranges supported by the font. The bit numbers are listed in the OpenType OS/2 specification. Corresponds to the OpenType OS/2 table ulCodePageRange fields.

    Default -> []`,
    infoLink:
      "https://learn.microsoft.com/en-us/typography/opentype/spec/os2#ulcodepagerange",
  },
  // Postscript Font Level Hints,
  // https://adobe-type-tools.github.io/font-tech-notes/pdfs/T1_SPEC.pdf
  {
    key: "postscriptBlueValues",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
    info: `Blue values are a list of integers that specify the y-coordinates of alignment zones in the font.`,
    infoLink: "https://adobe-type-tools.github.io/font-tech-notes/pdfs/T1_SPEC.pdf",
  },
  {
    key: "postscriptOtherBlues",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
    info: `Other blues are a list of integers that specify the y-coordinates of alignment zones in the font.`,
    infoLink: "https://adobe-type-tools.github.io/font-tech-notes/pdfs/T1_SPEC.pdf",
  },
  {
    key: "postscriptFamilyBlues",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
    info: `Family blues are a list of integers that specify the y-coordinates of alignment zones in a font family.`,
    infoLink: "https://adobe-type-tools.github.io/font-tech-notes/pdfs/T1_SPEC.pdf",
  },
  {
    key: "postscriptFamilyOtherBlues",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
    info: `Family other blues are a list of integers that specify the y-coordinates of alignment zones in a font family.`,
    infoLink: "https://adobe-type-tools.github.io/font-tech-notes/pdfs/T1_SPEC.pdf",
  },
  {
    key: "postscriptBlueScale",
    getDefaultFunction: () => 0.039625,
    formatter: NumberFormatter,
    info: `The optional BlueScale entry in the Private dictionary controls the point size at which overshoot suppression ceases.

    0.039625 -> default`,
    infoLink: "https://adobe-type-tools.github.io/font-tech-notes/pdfs/T1_SPEC.pdf",
  },
  {
    key: "postscriptBlueShift",
    getDefaultFunction: () => 1,
    formatter: NumberFormatter,
    info: `The optional BlueShift entry in the Private dictionary adds another capability to the treatment of overshoot behavior.`,
    infoLink: "https://adobe-type-tools.github.io/font-tech-notes/pdfs/T1_SPEC.pdf",
  },
  {
    key: "postscriptBlueFuzz",
    getDefaultFunction: () => 1,
    formatter: NumberFormatter,
    info: `The optional BlueFuzz entry in the Private dictionary is an integer value that specifies the number of character space units to extend (in both directions) the effect of an alignment zone on a horizontal stem.

    The default value of BlueFuzz is 1.`,
    infoLink: "https://adobe-type-tools.github.io/font-tech-notes/pdfs/T1_SPEC.pdf",
  },
  {
    key: "postscriptStemSnapH",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
    info: `The entry StemSnapH is an array of up to 12 real numbers of the most common widths (including the dominant width given in the StdHW array) for horizontal stems (measured vertically).`,
    infoLink: "https://adobe-type-tools.github.io/font-tech-notes/pdfs/T1_SPEC.pdf",
  },
  {
    key: "postscriptStemSnapV",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
    info: `The entry StemSnapV is an array of up to 12 real numbers of the most common widths (including the dominant width given in the StdVW array) for vertical stems (measured horizontally).`,
    infoLink: "https://adobe-type-tools.github.io/font-tech-notes/pdfs/T1_SPEC.pdf",
  },
  {
    key: "postscriptForceBold",
    getDefaultFunction: () => false,
    formatter: BooleanFormatter,
    info: `The value associated with ForceBold must be the Boolean value “true” or “false.” If the value is “true,” then in situations where character stems would normally be rendered at 1-pixel thick, a Type 1 font interpreter may thicken the stem.
    If the value is “false,” then a Type 1 font interpreter will not perform a special thickening operation.`,
    infoLink: "https://adobe-type-tools.github.io/font-tech-notes/pdfs/T1_SPEC.pdf",
  },
  // PostScript Specific Data
  // postscriptFontName // NOTE: not in ufoInfoAttributesToRoundTrip
  // postscriptFullName // NOTE: not in ufoInfoAttributesToRoundTrip
  {
    key: "postscriptSlantAngle",
    getDefaultFunction: () => 0.0,
    formatter: NumberFormatter,
    info: `Artificial slant angle must be integer or float. This must be an angle in counter-clockwise degrees from the vertical. This value is not the same as the italic angle.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#postscript-specific-data",
  },
  {
    key: "postscriptUniqueID",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `A unique ID number as defined in the Type 1/CFF specification.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#postscript-specific-data",
  },
  {
    key: "postscriptWeightName",
    getDefaultFunction: () => "postscriptWeightName",
    info: `A string indicating the overall weight of the font. This corresponds to the Type 1/CFF Weight field. It should have a reasonable value that reflects the openTypeOS2WeightClass value.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#postscript-specific-data",
  },
  {
    key: "postscriptIsFixedPitch",
    getDefaultFunction: () => false,
    formatter: BooleanFormatter,
    info: `Indicates if the font is monospaced. An authoring tool could calculate this automatically, but the designer may wish to override this setting. This corresponds to the Type 1/CFF isFixedPitched field`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#postscript-specific-data",
  },
  {
    key: "postscriptDefaultWidthX",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Default width for glyphs.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#postscript-specific-data",
  },
  {
    key: "postscriptNominalWidthX",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Nominal width for glyphs.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#postscript-specific-data",
  },
  {
    key: "postscriptDefaultCharacter",
    getDefaultFunction: () => "glyphName",
    info: "The name of the glyph that should be used as the default character in PFM files.",
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#postscript-specific-data",
  },
  {
    key: "postscriptWindowsCharacterSet",
    getDefaultFunction: () => 2,
    formatter: NumberFormatter,
    info: `The Windows character set. The values are defined below.

    2 = Default`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#postscriptwindowscharacterset-options",
  },
  // OpenType vhea Table Fields
  // openTypeVheaVertTypoAscender  // NOTE: part of lineMetricsVerMapping
  // openTypeVheaVertTypoDescender  // NOTE: part of lineMetricsVerMapping
  {
    key: "openTypeVheaVertTypoLineGap",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Line gap value. Corresponds to the OpenType vhea table vertTypoLineGap field.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-vhea-table-fields",
  },
  {
    key: "openTypeVheaCaretSlopeRise",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Caret slope rise value. Corresponds to the OpenType vhea table caretSlopeRise field.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-vhea-table-fields",
  },
  {
    key: "openTypeVheaCaretSlopeRun",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Caret slope run value. Corresponds to the OpenType vhea table caretSlopeRun field.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-vhea-table-fields",
  },
  {
    key: "openTypeVheaCaretOffset",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Caret offset value. Corresponds to the OpenType vhea table caretOffset field.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-vhea-table-fields",
  },
  // OpenType hhea Table Fields
  {
    key: "openTypeHheaCaretSlopeRise",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Caret slope rise value. Corresponds to the OpenType hhea table caretSlopeRise field.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-hhea-table-fields",
  },
  {
    key: "openTypeHheaCaretSlopeRun",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Caret slope run value. Corresponds to the OpenType hhea table caretSlopeRun field.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-hhea-table-fields",
  },
  {
    key: "openTypeHheaCaretOffset",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Caret offset value. Corresponds to the OpenType hhea table caretOffset field.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-hhea-table-fields",
  },
  // OpenType OS/2 Table Fields
  {
    key: "openTypeOS2SubscriptXSize",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Subscript horizontal font size. Corresponds to the OpenType OS/2 table ySubscriptXSize field.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-os2-table-fields",
  },
  {
    key: "openTypeOS2SubscriptYSize",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Subscript vertical font size. Corresponds to the OpenType OS/2 table ySubscriptYSize field.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-os2-table-fields",
  },
  {
    key: "openTypeOS2SubscriptXOffset",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Subscript horizontal font offset. Corresponds to the OpenType OS/2 table ySubscriptXOffset field.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-os2-table-fields",
  },
  {
    key: "openTypeOS2SubscriptYOffset",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Subscript vertical font offset. Corresponds to the OpenType OS/2 table ySubscriptYOffset field.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-os2-table-fields",
  },
  {
    key: "openTypeOS2SuperscriptXSize",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Superscript horizontal font size. Corresponds to the OpenType OS/2 table ySuperscriptXSize field.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-os2-table-fields",
  },
  {
    key: "openTypeOS2SuperscriptYSize",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Superscript vertical font size. Corresponds to the OpenType OS/2 table ySuperscriptYSize field.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-os2-table-fields",
  },
  {
    key: "openTypeOS2SuperscriptXOffset",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Superscript x offset. Corresponds to the OpenType OS/2 table ySuperscriptXOffset field.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-os2-table-fields",
  },
  {
    key: "openTypeOS2SuperscriptYOffset",
    getDefaultFunction: () => 0,
    formatter: NumberFormatter,
    info: `Superscript y offset. Corresponds to the OpenType OS/2 table ySuperscriptYOffset field.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-os2-table-fields",
  },
  // OpenType OS/2 Table Fields
  {
    key: "openTypeHeadLowestRecPPEM",
    getDefaultFunction: () => 6,
    formatter: NumberFormatter,
    info: "Smallest readable size in pixels. Corresponds to the OpenType head table lowestRecPPEM field.",
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-head-table-fields",
  },
  {
    key: "openTypeHeadFlags",
    getDefaultFunction: () => [],
    formatter: ArrayFormatter,
    info: `A list of bit numbers indicating the flags. The bit numbers are listed in the OpenType head specification. Corresponds to the OpenType head table flags field.`,
    infoLink:
      "https://unifiedfontobject.org/versions/ufo3/fontinfo.plist/#opentype-head-table-fields",
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
