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

const groupProperties = [
  "script",
  "category",
  "case",
  "subCategory",
  "glyphNameExtension",
];

export class GlyphOrganizer {
  constructor() {
    this._glyphNamesListFilterFunc = (item) => true; // pass all through

    this.setGroupings(groupProperties);
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
      const groupingInfo = this._groupingFunc(item);
      let group = groups.get(groupingInfo.groupingKey);
      if (!group) {
        group = { groupingInfo, glyphs: [] };
        groups.set(groupingInfo.groupingKey, group);
      }
      group.glyphs.push(item);
    }

    const groupEntries = [...groups.values()];
    groupEntries.sort(compareGroupInfo);

    const sections = groupEntries.map(({ groupingInfo, glyphs }) => ({
      label: groupingInfo.groupingKey,
      glyphs: glyphs,
    }));

    return sections;
  }
}

function compareGroupInfo(groupingEntryA, groupingEntryB) {
  const groupingInfoA = groupingEntryA.groupingInfo;
  const groupingInfoB = groupingEntryB.groupingInfo;

  for (const prop of groupProperties) {
    const valueA = groupingInfoA[prop];
    const valueB = groupingInfoB[prop];

    if (valueA === valueB) {
      continue;
    }

    if (valueA === undefined) {
      return 1;
    } else if (valueB === undefined) {
      return -1;
    }

    return valueA < valueB ? -1 : 1;
  }

  return 0;
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

  let groupingKey = "";

  if (groupingInfo.category) {
    groupingKey += groupingInfo.category;
  }

  if (groupingInfo.subCategory) {
    groupingKey += (groupingKey ? " / " : "") + groupingInfo.subCategory;
  }

  if (groupingInfo.case) {
    groupingKey += (groupingKey ? " / " : "") + groupingInfo.case;
  }

  if (groupingInfo.script) {
    groupingKey += (groupingKey ? " " : "") + `(${groupingInfo.script})`;
  }

  if (groupingInfo.glyphNameExtension) {
    groupingKey += (groupingKey ? " " : "") + `(*${groupingInfo.glyphNameExtension})`;
  }

  if (!groupingKey) {
    groupingKey = "Other";
  }

  return { groupingKey, ...groupingInfo };
}
