import * as html from "/core/html-utils.js";
import { translate } from "/core/localization.js";
import { GlyphsSearchField } from "/web-components/glyphs-search-field.js";

export class FontOverviewNavigation extends HTMLElement {
  constructor(fontOverviewController) {
    super();

    this.fontController = fontOverviewController.fontController;
    this.locationController = fontOverviewController.locationController;
    this.glyphsListItemsController = fontOverviewController.glyphsListItemsController;
  }

  async start() {
    this.fontSources = await this.fontController.getSources();

    this.currentFontSourceIdentifier =
      this.fontController.fontSourcesInstancer.defaultSourceIdentifier;
    this.locationController.model.fontLocationSourceMapped = {
      ...this.fontSources[this.currentFontSourceIdentifier]?.location,
    }; // Note: a font may not have font sources therefore the ?-check.

    await this._setupUI();
  }

  async _setupUI() {
    // font source selector
    this.fontSourceInput = html.select(
      {
        id: "font-source-select",
        style: "width: 100%;",
        onchange: (event) => {
          this.currentFontSourceIdentifier = event.target.value;
          this.locationController.model.fontLocationSourceMapped = {
            ...this.fontSources[this.currentFontSourceIdentifier].location,
          };
        },
      },
      []
    );

    this.fontSourceInput.innerHTML = "";

    for (const fontSourceIdentifier of await this.fontController.getSortedSourceIdentifiers()) {
      const sourceName = this.fontSources[fontSourceIdentifier].name;
      this.fontSourceInput.appendChild(
        html.option(
          {
            value: fontSourceIdentifier,
            selected: this.currentFontSourceIdentifier === fontSourceIdentifier,
          },
          [sourceName]
        )
      );
    }

    const fontSourceSelector = html.div(
      {
        class: "font-source-selector",
      },
      [
        html.label(
          { for: "font-source-select" },
          translate("sidebar.font-overview.font-source")
        ),
        this.fontSourceInput,
      ]
    );

    // glyph search
    this.glyphsSearch = new GlyphsSearchField(
      this.glyphsListItemsController,
      "glyphsListItems"
    );
    this.glyphsSearch.glyphMap = this.fontController.glyphMap;

    const glyphsSearch = html.div({ class: "glyph-search" }, [this.glyphsSearch]);

    this.appendChild(glyphsSearch);
    this.appendChild(fontSourceSelector);
  }

  getUserLocation() {
    const sourceLocation = this.fontSources[this.currentFontSourceIdentifier]
      ? this.fontSources[this.currentFontSourceIdentifier].location
      : {};
    return this.fontController.mapSourceLocationToUserLocation(sourceLocation);
  }
}

customElements.define("font-overview-navigation", FontOverviewNavigation);
