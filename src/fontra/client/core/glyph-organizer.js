export class GlyphOrganizer {
  constructor() {
    this._glyphNamesListFilterFunc = (item) => true; // pass all through
    this._groupingFunc = (item) => "Glyphs";
  }

  setSearchString(searchString) {
    const searchItems = searchString.split(/\s+/).filter((item) => item.length);
    const hexSearchItems = searchItems
      .filter((item) => [...item].length === 1) // num chars, not utf16 units!
      .map((item) => item.codePointAt(0).toString(16).toUpperCase().padStart(4, "0"));
    searchItems.push(...hexSearchItems);
    this._glyphNamesListFilterFunc = (item) => glyphFilterFunc(item, searchItems);
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
