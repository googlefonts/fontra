# Changelog for Fontra

## 2025-07-08

- Herlan/navv-1 contributed several improvements and additions for the OpenType Features panel:

  - added syntax coloring
  - added bracket matching
  - added comment toggle (command/control /)
  - added indentation with the tab key
  - added rectangular selection
  - fixed undo/redo
  - fixed a cosmetic issue on Windows
  - and more

  [Issue 2101](https://github.com/googlefonts/fontra/issues/2101), [Issue 2186](https://github.com/googlefonts/fontra/issues/2186), [PR 2212](https://github.com/googlefonts/fontra/pull/2212)

## 2025-07-04

- Gaëtan Baehr and Jérémie Hornus redesigned several of the edit tools: the knife tool, the shape/rectangle/oval tool, the kerning tool and the (soon-to-be-used) sidebearings tool. [PR 2210](https://github.com/googlefonts/fontra/pull/2210)
- [Kerning] The kerning tool now has a context menu, allowing users to make kerning exceptions for group kerning. [Issue 2204](https://github.com/googlefonts/fontra/issues/2204) [PR 2209](https://github.com/googlefonts/fontra/pull/2209)
- Added a Bengali glyph set, kindly contributed by Dr Anirban Mitra. [Issue 2189](https://github.com/googlefonts/fontra/issues/2189) [PR 2190](https://github.com/googlefonts/fontra/pull/2190)

## 2025-07-03

- [Glyphs backend] Implemented "Find glyphs that use _this glyph_". [fontra-glyphs issue 103](https://github.com/googlefonts/fontra-glyphs/issues/103) [fontra-glyphs PR 104](https://github.com/googlefonts/fontra-glyphs/pull/104)
- [Kerning] Allow kerning edits to be constrained to 5, 10 or 50 units, by using alt, shift or als-shift while dragging. Make arrow key kerning editing behave the same with respect to these modifier keys. Contributed by Gaëtan Baehr. [PR 2205](https://github.com/googlefonts/fontra/pull/2205)

## 2025-07-01

- Fixed a bug that caused interpolated kerning to show the wrong value after editing a kerning pair. [PR 2194](https://github.com/googlefonts/fontra/pull/2194)
- Fixed a problem with the placeholder string for undefined glyphs in the edit canvas. [Issue 2192](https://github.com/googlefonts/fontra/issues/2192) [PR 2195](https://github.com/googlefonts/fontra/pull/2195)
- Fix writing of the units-per-em value when copying/exporting to .designspace/.ufo. [Issue 2196](https://github.com/googlefonts/fontra/issues/2196) [PR 2197](https://github.com/googlefonts/fontra/pull/2197)

## 2025-06-30

- Fixed a bug that broke interpolation when adding kerning to a new source. [PR 2191](https://github.com/googlefonts/fontra/pull/2191)

## 2025-06-27

- [Glyphs backend] Improve editing experience with larger .glyphs files. [fontra-glyphs PR 101](https://github.com/googlefonts/fontra-glyphs/pull/101)

## 2025-06-25

- [Glyphs backend] Added support for writing kerning [fontra-glyphs PR 99](https://github.com/googlefonts/fontra-glyphs/pull/99)
- [Glyphs backend] Added support for deleting glyphs [fontra-glyphs PR 100](https://github.com/googlefonts/fontra-glyphs/pull/100)

## 2025-06-21

- Initial support for editing kerning has landed. There is a new Kerning tool among the edit tools: ove the pointer to a combination and the pair will highlight and you can drag it to change the value. Or use arrow left or right. Tou can select multiple pairs using shift-click. A kern group can be assigned for either side of the glyph in the selection info panel, when a glyph is selected. [Tracking issue 1501](https://github.com/googlefonts/fontra/issues/1501).
- The relatively new sorting behavior in the Glyph sources panel is not loved by everyone. There is now a little hamburger menu where you can turn off sorting. [Issue 2126](https://github.com/googlefonts/fontra/issues/2126) [PR 2182](https://github.com/googlefonts/fontra/pull/2182)
- [Glyphs backend] Olli Meier implemented OpenType feature reading and writing for the Glyphs backend. [fontra-glyphs PR 95](https://github.com/googlefonts/fontra-glyphs/pull/95)
- [Windows] Fixed a bug on Windows where Fontra Pak would refuse to launch if another application was listening to the default port (8000). [Issue 2180](https://github.com/googlefonts/fontra/issues/2180) [PR 2181](https://github.com/googlefonts/fontra/pull/2181) [fontra-pak PR 172](https://github.com/googlefonts/fontra-pak/pull/172)

## 2025-06-04

- Fix warning caused by HTML Canvas API misuse. [Issue 2171](https://github.com/googlefonts/fontra/issues/2171) [PR 2174](https://github.com/googlefonts/fontra/pull/2174)
- Added Georgian glyph sets. [PR 2167](https://github.com/googlefonts/fontra/pull/2167)
- Update glyph-data.csv. [PR 2172](https://github.com/googlefonts/fontra/pull/2172)

## 2025-05-08

- Fix miscellaneous bugs with the glyph source UI [PR 2161](https://github.com/googlefonts/fontra/pull/2161)
  - Don't misbehave when creating a new glyph source from a font source immediately after font axis/sources were edited
  - Don't misbehave when trying to edit a glyph off-source, when a glyph axis is involved
  - Fix default source/layer name fields in Add Source and Edit Source Properties dialog for variable glyphs (glyphs that have local axes)
- Fix "disconnect" between two windows/tabs after network disconnect / computer sleep. [PR 2152](https://github.com/googlefonts/fontra/pull/2152)

## 2025-04-11

- Create better placeholder strings for "undefined" glyphs, in the font overview and in the editor. This is especially effective for Arabic contextual alternates, and ligatures. Contributed by Khaled Hosny. [Issue 2005](https://github.com/googlefonts/fontra/issues/2005) [PR 2010](https://github.com/googlefonts/fontra/pull/2010)
- Fix glitch where the source layers (background layers) UI list does not immediately show when putting a glyph in edit mode. [Issue 2143](https://github.com/googlefonts/fontra/issues/2143) [PR 2144](https://github.com/googlefonts/fontra/pull/2144)

## 2025-04-07

- Fixed Fontra application settings: due to a regression this view gave a 403 error. [PR 2138](https://github.com/googlefonts/fontra/pull/2138)

## 2025-04-06

- Implement applying kerning in the editor canvas. [Issue 2135](https://github.com/googlefonts/fontra/issues/2135) [PR 2136](https://github.com/googlefonts/fontra/pull/2136)

## 2025-03-30

- [fontra-glyphs] The Glyphs backend now supports background layers, for reading and writing. [fontra-glyphs issue 88](https://github.com/googlefonts/fontra-glyphs/issues/88) [fontra-glyphs PR 92](https://github.com/googlefonts/fontra-glyphs/pull/92)

## 2025-03-26

- Fixed bug with undo and source (background) layers: undo wouldn't switch to the correct source layer, with a visual glitch because the correct layer would be in edit mode. [Issue 2119](https://github.com/googlefonts/fontra/issues/2119) [PR 2120](https://github.com/googlefonts/fontra/pull/2120)
- Fixed various problems with the font sources panel (in the font info view), when there were no sources at all. [Issue 2117](https://github.com/googlefonts/fontra/issues/2117) [PR 2118](https://github.com/googlefonts/fontra/pull/2118)

## 2025-03-25

- New features in the glyph sources list:
  - The glyph sources are now sorted according to the axes (they used to be in creation order)
  - The _default_ source's name is now rendered in bold, so it's easier to find
  - For each _font source_ location ("global location") for which the glyph does _not_ have a source, there is now a "virtual source" in the list, rendered in gray. To create an _actual_ source at that location, either double-click the virtual source, or, while the virtual source is selected, start modifying the glyph.
  - [Issue 1572](https://github.com/googlefonts/fontra/issues/1572), [Issue 1639](https://github.com/googlefonts/fontra/issues/1639), [Issue 1640](https://github.com/googlefonts/fontra/issues/1640), [Issue 2114](https://github.com/googlefonts/fontra/issues/2114)
  - [PR 2102](https://github.com/googlefonts/fontra/pull/2102), [PR 2098](https://github.com/googlefonts/fontra/pull/2098)
- Fixed subtle key handling bug with popup menus inside a dialog [Issue 2113](https://github.com/googlefonts/fontra/issues/2113) [PR 2115](https://github.com/googlefonts/fontra/pull/2115)

## 2025-03-22

- [designspace/ufo] Fixed background layers for sparse masters. [Issue 2111](https://github.com/googlefonts/fontra/issues/2111) [PR 2112](https://github.com/googlefonts/fontra/pull/2112)

## 2025-03-20

- New feature: we added a Font Info panel for editing OpenType features. [Issue 2080](https://github.com/googlefonts/fontra/issues/2080) [PR 2104](https://github.com/googlefonts/fontra/pull/2104)

## 2025-03-19

- New feature: we added UI for lower level OpenType settings, as part of the Font Info panel and the Font Sources panel. [Issue 2023](https://github.com/googlefonts/fontra/issues/2023) [PR 2039](https://github.com/googlefonts/fontra/pull/2039)
- Vastly improved keyboard navigation of the menu bar and (contextual) menus. [Issue 2061](https://github.com/googlefonts/fontra/issues/2061) [PR 2062](https://github.com/googlefonts/fontra/pull/2062)
- Fixed bug where components appeared incompatible. [Issue 2092](https://github.com/googlefonts/fontra/issues/2092) [PR 2093](https://github.com/googlefonts/fontra/pull/2093)
- [fontra-rcjk] Fixed bug where the list of projects was duplicated. [Issue 2094](https://github.com/googlefonts/fontra/issues/2094) [PR 2095](https://github.com/googlefonts/fontra/pull/2095)

## 2025-03-16

- Fixed several bugs in the designspace backend related to editing font sources. [Issue 2040](https://github.com/googlefonts/fontra/issues/2040) [PR 2091](https://github.com/googlefonts/fontra/pull/2091)

## 2025-03-14

New features:

- Background layers are here! [Issue 50](https://github.com/googlefonts/fontra/issues/50), many PR's, see issue.
- Beginnings of writing .glyphs and .glyphspackage files. First step: glyph data. [fontra-glyphs issue 75](https://github.com/googlefonts/fontra-glyphs/issues/75) [fontra-glyphs PR 76](https://github.com/googlefonts/fontra-glyphs/pull/76) [Issue for future work](https://github.com/googlefonts/fontra-glyphs/issues/87)

Bugfixes:

- Units Per Em is now exported properly (This affected "Export as", `fontra-workflow` and `fontra-copy`). [Issue 2044](https://github.com/googlefonts/fontra/issues/2044) [PR 2046](https://github.com/googlefonts/fontra/pull/2046)
- Fixed bug where the context menu wouldn't go away [Issue 2068](https://github.com/googlefonts/fontra/issues/2068) [PR 2069](https://github.com/googlefonts/fontra/pull/2069)
- Fixed false positive with the interpolation compatibility checker. [Issue 2081](https://github.com/googlefonts/fontra/issues/2081) [PR 2083](https://github.com/googlefonts/fontra/pull/2083)

Enhancements:

- Don't write empty kern data to .fontra project. [Issue 2045](https://github.com/googlefonts/fontra/issues/2045) [PR 2047](https://github.com/googlefonts/fontra/pull/2047)
- Show a warning when deleting a font source. [Issue 2048](https://github.com/googlefonts/fontra/issues/2048) [PR 2055](https://github.com/googlefonts/fontra/pull/2055)
- Allow menus to be opened with click-drag, not just click. [Issue 2049](https://github.com/googlefonts/fontra/issues/2049) [PR 2060](https://github.com/googlefonts/fontra/pull/2060)

## 2025-03-05

There have been some major changes in the front end, in order to have a clearer separation between the Python server code and the front end. This makes the front-end usable independently from the server.

- All front end code and assets moved to a new folder, `src-js`
- A bundler (webpack) is now used to package assets and code
  - To run the bundler once: `npm run bundle`
  - To run the bundler in "watch" mode (updates bundle on changes): `npm run bundle-watch`
  - Or start the server with the new `--dev` option, which runs `npm run bundle-watch` in the background. For example:
    - `fontra --dev filesystem path/to/fonts/`
  - `pip install path/to/fontra/` will run the bundler implicitly
- Similar changes were made in the `fontra-rcjk` repository
- Fontra Pak was adjusted to these changes as well
- [Issue 1952](https://github.com/googlefonts/fontra/issues/1952) [PR 2053](https://github.com/googlefonts/fontra/pull/2053) [fontra-rcjk PR 224](https://github.com/googlefonts/fontra-rcjk/pull/224)

## 2025-02-28

Many smaller bugs were fixed:

- Allow menus from the menubar to be opened with click-drag [Issue 2049](https://github.com/googlefonts/fontra/issues/2049) [PR 2060](https://github.com/googlefonts/fontra/pull/2060)
- Paste only plain text in editable list cells [Issue 2043](https://github.com/googlefonts/fontra/issues/2043) [PR 2057](https://github.com/googlefonts/fontra/pull/2057)
- Fix tooltips layout issues [Issue 2050](https://github.com/googlefonts/fontra/issues/2050) [PR 2056](https://github.com/googlefonts/fontra/pull/2056)
- Show warning befor deleting a font source, as this can have deeper consequences than one might think [Issue 2048](https://github.com/googlefonts/fontra/issues/2048) [PR 2055](https://github.com/googlefonts/fontra/pull/2055)
- Improve point deletion if a point is overlapping another, or is a tangent [Issue 2033](https://github.com/googlefonts/fontra/issues/2033) [PR 2035](https://github.com/googlefonts/fontra/pull/2035) [PR 2038](https://github.com/googlefonts/fontra/pull/2038)
- Fix bug where the Italic Angle font source parameter was written as the wrong type [Issue 2036](https://github.com/googlefonts/fontra/issues/2036) [PR 2037](https://github.com/googlefonts/fontra/pull/2037)

## 2025-02-16

- Do not display the "selection bounds" handles if the selection is only a single point [Issue 2022](https://github.com/googlefonts/fontra/issues/2022) [PR 2024](https://github.com/googlefonts/fontra/pull/2024)
- Fix bug in reference font panel [Issue 2011](https://github.com/googlefonts/fontra/issues/2011) [PR 2012](https://github.com/googlefonts/fontra/pull/2012)
- Redesigned the Font Source panel [Issue 1997](https://github.com/googlefonts/fontra/issues/1997) [PR 2007](https://github.com/googlefonts/fontra/pull/2007)
- Added initial support for global guidelines. For now they need to be set in the Font Sources panel. Adding or editing global guidelines in the glyph editor will be implemented later. [Issue 909](https://github.com/googlefonts/fontra/issues/909) [Issue 1963](https://github.com/googlefonts/fontra/issues/1963) [PR 2021](https://github.com/googlefonts/fontra/pull/2021)

## 2025-01-30

- Added support for reading .woff and .woff2 [PR 1999](https://github.com/googlefonts/fontra/pull/1999)

## 2025-01-27

- Misc improvements to the Font Overview
- Added preset glyph sets from Google Fonts, Black Foundry, Adobe and Christoph Koeberlin
- Fixed a bug with point deletion [Issue 1980](https://github.com/googlefonts/fontra/issues/1980), [PR 1981](https://github.com/googlefonts/fontra/pull/1981)

## 2025-01-21

The Font Overview is ready to be used everywhere, including in Fontra Pak. Documentation will follow soon.

It has support for "template glyphsets", that can be chosen from collections of presets, or made from any publically hosted text, .tsv or .csv data. This includes files on GitHub and publically readable Google Docs or Sheets.

There will be further improvements and additions. Ongoing work: [Issue 1886](https://github.com/googlefonts/fontra/issues/1886)

## 2025-01-17

- A change in the URL format: the project identifier is now in the URL query, instead of part of the URL path [Issue 1960](https://github.com/googlefonts/fontra/issues/1960), [PR 1959](https://github.com/googlefonts/fontra/pull/1959)
- Editor tools: right-clicking or control-clicking on a tool with sub-tools will now show the subtools instead of the browser's context menu [Issue 1953](https://github.com/googlefonts/fontra/issues/1953), [PR 1956](https://github.com/googlefonts/fontra/pull/1956)

## 2025-01-14

- Fixed a regression with the Font menu [Issue 1941](https://github.com/googlefonts/fontra/issues/1941), [PR 1942](https://github.com/googlefonts/fontra/pull/1942)
- Fixed a regression with messages from server [PR 1939](https://github.com/googlefonts/fontra/pull/1939)

## 2025-01-06

- Fixed bug related to deleting points [Issue 1910](https://github.com/googlefonts/fontra/issues/1910), [PR 1916](https://github.com/googlefonts/fontra/pull/1916)
- Added robots.txt to HTTP root folder [PR 1905](https://github.com/googlefonts/fontra/pull/1905)
- Small improvements to Related Glyphs & Characters panel (selecting multiple glyphs, keyboard navigation) [PR 1906](https://github.com/googlefonts/fontra/pull/1906)
- Accordion view: alt-click on a header folds/unfolds all items [PR 1901](https://github.com/googlefonts/fontra/pull/1901)
- Implement finding glyph names for code points and code points for glyph names in JS, via a CSV version of GlyphData.xml. This is a performance improvement, and needed for the upcoming Font Overview [PR 1900](https://github.com/googlefonts/fontra/pull/1900)
- Fixed a regression witb CJK Design Frame settings [PR 1883](https://github.com/googlefonts/fontra/pull/1883)
- Fixed a regression with the Knife Tool [PR 1870](https://github.com/googlefonts/fontra/pull/1870)

## 2024-12-19

- Making the interface between server and client more explicit [PR 1863](https://github.com/googlefonts/fontra/pull/1863)
- Fixed editing bug with multiple edit views [PR 1870](https://github.com/googlefonts/fontra/pull/1870)
- Prevent `fontra-copy` and Fontra Pak's "Export as..." to write on top of the source data (as this destroyed the data)
  - `fontra-copy`: [PR 1860](https://github.com/googlefonts/fontra/pull/1860)
  - Fontra Pak: [PR 148](https://github.com/googlefonts/fontra-pak/pull/148)
- Fontra Pak: add button with link to documentation [PR 143](https://github.com/googlefonts/fontra-pak/pull/143)

## 2024-12-04

- Fixes "clean view" (space bar) on Safari [PR 1835](https://github.com/googlefonts/fontra/pull/1835)

## 2024-11-29

- Japanese UI translation (thanks Masaki Ando!)

## 2024-11-28

- Keep the focus on the canvas when clicking icon buttons and (some) list cell buttons [PR 1829](https://github.com/googlefonts/fontra/pull/1829)

## 2024-11-27

- Add 'Add background image' menu to context menu [PR 1827](https://github.com/googlefonts/fontra/pull/1827)
- Fixed bug with colorizing the background image on Safari [PR 1825](https://github.com/googlefonts/fontra/pull/1825)
- Reorganize context menu: put "Edit" items under a sub menu [PR 1824](https://github.com/googlefonts/fontra/pull/1824)
- Fix the Knife tool [PR 1823](https://github.com/googlefonts/fontra/pull/1823)

## 2024-11-20

- Add support for background image colorization [PR 1815](https://github.com/googlefonts/fontra/pull/1815)

## 2024-11-18

New feature: background images.

A background image can be added to a glyph in three ways:

- Paste image data
- Drop an image file onto the canvas
- Choose an image file from the user's hard drive, with the "Glyph" -> "Add background image..." menu.

The image file or data can be in PNG or JPEG format.

The glyph needs to be in edit mode, and at a selected source (not at an interpolation).

Fontra's background image feature is mostly compatible with UFO background images, although it doesn't implement UFO's colorization feature yet. Fontra does allow the opacity of the image to be set.

Background images are locked by default, and can be unlocked with the "Unlock background images" context menu item.

Selected background images can be moved around by dragging, and they participate in the Selection Transformation panel's operations.

The Selection Info panel shows the settings for a selected background image: the Opacity can be edited there and the Transformation settings can be edited numerically there.

Caveat: support for background images is limited to the `.designspace`/`.ufo` and `.fontra` backends. It is currently not supported in the `rcjk` backend.

[Issue 1660](https://github.com/googlefonts/fontra/issues/1660), [Issue 1777](https://github.com/googlefonts/fontra/issues/1777) (There were too many PRs to mention individually here.)

## 2024-11-13

- Improved UI translations [PR 1764](https://github.com/googlefonts/fontra/pull/1764)
- Added "Select previous/next glyph" menu items [PR 1706](https://github.com/googlefonts/fontra/pull/1706)
- Partial support for background images (more to come) [PR 1775](https://github.com/googlefonts/fontra/pull/1775)
- Add support for many UFO font info fields, so they won't get lost during round-tripping [PR 1770](https://github.com/googlefonts/fontra/pull/1770)
- Fixed cosmetic issue with scrollbars on Windows [PR 1767](https://github.com/googlefonts/fontra/pull/1767)
- Fixed bug with Copy/Paste menu items [PR 1756](https://github.com/googlefonts/fontra/pull/1756)

## 2024-10-24

- Various improvements to the font sources panel [PR 1739](https://github.com/googlefonts/fontra/pull/1739)
- Add changelog file [PR 1749](https://github.com/googlefonts/fontra/pull/1749)

## 2024-10-23

- New cross-axis mapping page for avar2 mappings [PR 1729](https://github.com/googlefonts/fontra/pull/1729)
- Allow custom shortcuts for selecting previous/next reference font [PR 1742](https://github.com/googlefonts/fontra/pull/1742)

## 2024-10-16

- New pen tool icon [PR 1726](https://github.com/googlefonts/fontra/pull/1726)

## 2024-10-14

- New languages: French, Dutch, German

## 2024-10-13

- Fontra Pak: build macOS application as "Universal2" binary, so it runs natively on all processor types [Fontra Pak PR 108](https://github.com/googlefonts/fontra-pak/pull/108)

## 2024-10-12

- Delete gear panel (move to difference locations, for example: View -> Glyph editor apperance) [PR 1701](https://github.com/googlefonts/fontra/pull/1701)

## 2024-10-10

- Fontra Pak: added "Export as..." functionality [Fontra Pak PR 133](https://github.com/googlefonts/fontra-pak/pull/133)

## 2024-09-27

- Shape tool (rectangle, ellipse)
- Knife tool

### New editor features

- Interactive transformation (scale, rotate)
- Glyph level guidelines
- Close/Join contours
- Anchors
- Glyph locking

### New panels

- Development status definitions panel (colors)
- Sources panel (Global sources editor)
- Shortcuts panel

### New sidebars

- Selection Transformation
  - transform objects (move, scale, rotate, skew)
  - Align and distribute objects
  - Path operations like remove overlaps
- Glyph Notes
- Related Glyphs & Characters

### New visualizations

- Line metrics
- Development status color
- Transform selection
- Guidelines
- Component nodes and handles
- Anchor names
- Contour indices
- Component names and indices
- Coordinates
- Point indices
- Glyph lock icon for non-editing glyphs

### Misc

- UI Translation (Chinese and English)

## 2024-03-01

- Fontra Pak: Create new font
- Menu bar
- Axis editor
  - Mapping (graph + list)
  - Axis value labels
  - Discrete axis
  - Axis reordering
- side bearings
- shift click
