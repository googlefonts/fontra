# Changelog for Fontra

## 2024-11-27

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
