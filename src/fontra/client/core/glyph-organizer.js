import { getGlyphInfoFromCodePoint, getGlyphInfoFromGlyphName } from "./glyph-data.js";

function getGlyphInfo(glyph) {
  const codePoint = glyph.codePoints[0];
  return (
    getGlyphInfoFromCodePoint(codePoint) ||
    getGlyphInfoFromGlyphName(glyph.glyphName) ||
    getGlyphInfoFromGlyphName(getBaseGlyphName(glyph.glyphName))
  );
}

function getGroupingInfo(glyph, options) {
  const glyphInfo = getGlyphInfo(glyph);
  return {
    ...glyphInfo,
    glyphNameExtension: options.glyphNameExtension
      ? getGlyphNameExtension(glyph.glyphName)
      : undefined,
  };
}

export class GlyphOrganizer {
  constructor() {
    this._glyphNamesListFilterFunc = (item) => true; // pass all through

    this.setGroupings([
      "category",
      "subCategory",
      "case",
      "script",
      "glyphNameExtension",
    ]);
  }

  setSearchString(searchString) {
    const searchItems = searchString.split(/\s+/).filter((item) => item.length);
    const hexSearchItems = searchItems
      .filter((item) => [...item].length === 1) // num chars, not utf16 units!
      .map((item) => item.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"));
    searchItems.push(...hexSearchItems);
    this._glyphNamesListFilterFunc = (item) => glyphFilterFunc(item, searchItems);
  }

  setGroupings(groupings) {
    const options = {};
    groupings.forEach((grouping) => (options[grouping] = true));

    this.setGroupingFunc((glyph) => getGroupingKey(glyph, options));
  }

  setGroupingFunc(groupingFunc) {
    this._groupingFunc = groupingFunc;
  }

  sortGlyphs(glyphs) {
    glyphs = [...glyphs];
    glyphs.sort(glyphItemSortFunc);
    return glyphs;
  }

  filterGlyphs(glyphs) {
    return glyphs.filter(this._glyphNamesListFilterFunc);
  }

  groupGlyphs(glyphs) {
    const groups = new Map();

    for (const item of glyphs) {
      const grouping = this._groupingFunc(item);
      let group = groups.get(grouping);
      if (!group) {
        group = [];
        groups.set(grouping, group);
      }
      group.push(item);
    }

    const sections = [];
    for (const [key, value] of groups.entries()) {
      sections.push({ label: key, glyphs: value });
    }

    return sections;
  }
}

function glyphFilterFunc(item, searchItems) {
  if (!searchItems.length) {
    return true;
  }
  for (const searchString of searchItems) {
    if (item.glyphName.indexOf(searchString) >= 0) {
      return true;
    }
    if (item.codePoints[0] !== undefined) {
      const char = String.fromCodePoint(item.codePoints[0]);
      if (searchString === char) {
        return true;
      }
    }
  }
  return false;
}

function glyphItemSortFunc(item1, item2) {
  const uniCmp = compare(item1.codePoints[0], item2.codePoints[0]);
  const glyphNameCmp = compare(item1.glyphName, item2.glyphName);
  return uniCmp ? uniCmp : glyphNameCmp;
}

function compare(a, b) {
  // sort undefined at the end
  if (a === b) {
    return 0;
  } else if (a === undefined) {
    return 1;
  } else if (b === undefined) {
    return -1;
  } else if (a < b) {
    return -1;
  } else {
    return 1;
  }
}

function getGlyphNameExtension(glyphName) {
  const i = glyphName.lastIndexOf(".");
  return i >= 1 ? glyphName.slice(i) : "";
}

function getBaseGlyphName(glyphName) {
  const i = glyphName.indexOf(".");
  return i >= 1 ? glyphName.slice(0, i) : "";
}

function getGroupingKey(glyph, options) {
  const groupingInfo = getGroupingInfo(glyph, options);

  let key = "";

  if (groupingInfo.category) {
    key += groupingInfo.category;
  }

  if (groupingInfo.subCategory) {
    key += (key ? "/" : "") + groupingInfo.subCategory;
  }

  if (groupingInfo.case) {
    key += (key ? "/" : "") + groupingInfo.case;
  }

  if (groupingInfo.script) {
    key += (key ? " " : "") + `(${groupingInfo.script})`;
  }

  if (groupingInfo.glyphNameExtension) {
    key += (key ? " " : "") + `(*${groupingInfo.glyphNameExtension})`;
  }

  if (!key) {
    key = "Other";
  }

  return key;
}
