import { groupByKeys, groupByProperties } from "/core/glyph-organizer.js";
import * as html from "/core/html-utils.js";
import { translate } from "/core/localization.js";
import { ObservableController } from "/core/observable-object.js";
import { labeledCheckbox } from "/core/ui-utils.js";
import { GlyphSearchField } from "/web-components/glyph-search-field.js";
import { Accordion } from "/web-components/ui-accordion.js";

export class FontOverviewNavigation extends HTMLElement {
  constructor(fontOverviewController) {
    super();

    this.fontController = fontOverviewController.fontController;
    this.fontOverviewSettingsController =
      fontOverviewController.fontOverviewSettingsController;
    this.fontOverviewSettings = this.fontOverviewSettingsController.model;

    this._setupUI();
  }

  async _setupUI() {
    this.fontSources = await this.fontController.getSources();

    this.fontSourceInput = html.select(
      {
        id: "font-source-select",
        style: "width: 100%;",
        onchange: (event) => {
          const fontSourceIdentifier = event.target.value;
          const sourceLocation = {
            ...this.fontSources[fontSourceIdentifier]?.location,
          }; // A font may not have any font sources, therefore the ?-check
          this.fontOverviewSettings.fontLocationSource = sourceLocation;
        },
      },
      []
    );

    for (const fontSourceIdentifier of this.fontController.getSortedSourceIdentifiers()) {
      const sourceName = this.fontSources[fontSourceIdentifier].name;
      this.fontSourceInput.appendChild(
        html.option({ value: fontSourceIdentifier }, [sourceName])
      );
    }

    this.fontOverviewSettingsController.addKeyListener("fontLocationSource", (event) =>
      this._updateFontSourceInput()
    );
    this._updateFontSourceInput();

    this.searchField = new GlyphSearchField({
      settingsController: this.fontOverviewSettingsController,
      searchStringKey: "searchString",
    });

    const accordion = new Accordion();

    accordion.items = [
      {
        label: translate("sources.labels.location"),
        content: this.fontSourceInput,
        open: true,
      },
      {
        label: "Group by", // TODO: translate
        content: this._makeGroupByUI(),
        open: true,
      },
      {
        label: "Project glyph sets", // TODO: translate
        content: this._makeProjectGlyphSetsUI(),
        open: true,
      },
      {
        label: "My glyph sets", // TODO: translate
        content: this._makeMyGlyphSetsUI(),
        open: true,
      },
    ];

    this.appendChild(this.searchField);
    this.appendChild(accordion);
  }

  _makeGroupByUI() {
    const groupByController = new ObservableController(
      Object.fromEntries(
        this.fontOverviewSettings.groupByKeys.map((key) => [key, true])
      )
    );

    groupByController.addListener((event) => {
      if (event.senderInfo?.senderID !== this) {
        this.fontOverviewSettings.groupByKeys = groupByKeys.filter(
          (key) => groupByController.model[key]
        );
      }
    });

    this.fontOverviewSettingsController.addKeyListener("groupByKeys", (event) => {
      groupByController.withSenderInfo({ senderID: this }, () => {
        for (const key of groupByKeys) {
          groupByController.model[key] = event.newValue.includes(key);
        }
      });
    });

    return html.div({}, [
      ...groupByProperties.map(({ key, label }) =>
        labeledCheckbox(label, groupByController, key)
      ),
    ]);
  }

  _makeProjectGlyphSetsUI() {
    const projectGlyphSetsController = new ObservableController({});

    return html.div({ class: "glyph-sets-container" }, [
      labeledCheckbox(
        "This font's glyph set",
        projectGlyphSetsController,
        "__this_font__"
      ),
    ]);
  }

  _makeMyGlyphSetsUI() {
    return html.div({ class: "glyph-sets-container" }, []);
  }

  _updateFontSourceInput() {
    const fontSourceIdentifier =
      this.fontController.fontSourcesInstancer.getLocationIdentifierForLocation(
        this.fontOverviewSettings.fontLocationSource
      );
    for (const optionElement of this.fontSourceInput.children) {
      optionElement.selected = optionElement.value === fontSourceIdentifier;
    }
  }
}

customElements.define("font-overview-navigation", FontOverviewNavigation);
