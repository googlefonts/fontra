import {
  GlyphOrganizer,
  groupByKeys,
  groupByProperties,
} from "/core/glyph-organizer.js";
import * as html from "/core/html-utils.js";
import { translate } from "/core/localization.js";
import { ObservableController } from "/core/observable-object.js";
import { labeledCheckbox } from "/core/ui-utils.js";
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

    const groupByController = new ObservableController({});

    groupByController.addListener(
      (event) =>
        (this.fontOverviewSettings.groupByKeys = groupByKeys.filter(
          (key) => groupByController.model[key]
        ))
    );

    const groupByContainer = html.div({}, [
      html.span({}, ["Group by"]),
      ...groupByProperties.map(({ key, label }) =>
        labeledCheckbox(label, groupByController, key)
      ),
    ]);

    this.searchField = new GlyphSearchField({
      settingsController: this.fontOverviewSettingsController,
      searchStringKey: "searchString",
    });

    this.appendChild(this.searchField);
    this.appendChild(fontSourceSelector);
    this.appendChild(groupByContainer);
  }
}

customElements.define("font-overview-navigation", FontOverviewNavigation);
