import { GlyphOrganizer } from "/core/glyph-organizer.js";
import * as html from "/core/html-utils.js";
import { translate } from "/core/localization.js";
import { GlyphSearchField } from "/web-components/glyph-search-field.js";

export class FontOverviewNavigation extends HTMLElement {
  constructor(fontOverviewController) {
    super();

    this.fontController = fontOverviewController.fontController;
    this.fontOverviewSettingsController =
      fontOverviewController.fontOverviewSettingsController;
    this.fontOverviewSettings = this.fontOverviewSettingsController.model;
    this.glyphOrganizer = new GlyphOrganizer();

    this._setupUI();
  }

  async _setupUI() {
    this.fontSources = await this.fontController.getSources();

    this.fontSourceInput = html.select(
      {
        id: "font-source-select",
        style: "width: 100%;",
        onchange: (event) => {
          this.fontOverviewSettings.fontSourceIdentifier = event.target.value;
        },
      },
      []
    );

    for (const fontSourceIdentifier of this.fontController.getSortedSourceIdentifiers()) {
      const sourceName = this.fontSources[fontSourceIdentifier].name;
      this.fontSourceInput.appendChild(
        html.option(
          {
            value: fontSourceIdentifier,
            selected:
              this.fontOverviewSettings.fontSourceIdentifier === fontSourceIdentifier,
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

    this.searchField = new GlyphSearchField({
      observer: this.fontOverviewSettingsController,
      observerKey: "searchString",
    });

    this.appendChild(this.searchField);
    this.appendChild(fontSourceSelector);
  }
}

customElements.define("font-overview-navigation", FontOverviewNavigation);
