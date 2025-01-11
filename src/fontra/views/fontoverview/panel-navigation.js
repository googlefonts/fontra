import { groupByKeys, groupByProperties } from "/core/glyph-organizer.js";
import * as html from "/core/html-utils.js";
import { translate } from "/core/localization.js";
import { ObservableController } from "/core/observable-object.js";
import { difference, symmetricDifference, union } from "/core/set-ops.js";
import { labeledCheckbox, labeledTextInput } from "/core/ui-utils.js";
import { GlyphSearchField } from "/web-components/glyph-search-field.js";
import { dialogSetup } from "/web-components/modal-dialog.js";
import { PopupMenu } from "/web-components/popup-menu.js";
import { Accordion } from "/web-components/ui-accordion.js";

export class FontOverviewNavigation extends HTMLElement {
  constructor(fontOverviewController) {
    super();

    this.fontController = fontOverviewController.fontController;
    this.fontOverviewSettingsController =
      fontOverviewController.fontOverviewSettingsController;
    this.fontOverviewSettings = this.fontOverviewSettingsController.model;

    this._checkboxControllers = {};

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

    this.appendChild(this.searchField);

    const accordion = new Accordion();

    accordion.appendStyle(`
      .glyph-set-container {
        display: grid;
        justify-items: left;
        gap: 0.5em;
      }

      .add-glyph-set-button {
        padding: 0.25em 1em 0.3em 1em;
        font-size: 0.9em;
      }
    `);

    accordion.onItemOpenClose = (item, openClose) => {
      const setOp = openClose ? difference : union;
      this.fontOverviewSettingsController.setItem(
        "closedNavigationSections",
        setOp(this.fontOverviewSettings.closedNavigationSections, [item.id]),
        { sentFromUserClick: true }
      );
    };

    this.fontOverviewSettingsController.addKeyListener(
      "closedNavigationSections",
      (event) => {
        if (!event.senderInfo?.sentFromUserClick) {
          const diff = symmetricDifference(event.newValue, event.oldValue);
          for (const id of diff) {
            const item = accordion.items.find((item) => item.id == id);
            accordion.openCloseAccordionItem(item, !event.newValue.has(id));
          }
        }
      }
    );

    this._projectGlyphSetsItem = {
      label: "Project glyph sets", // TODO: translate
      id: "project-glyph-sets",
      content: html.div(),
    };

    this._myGlyphSetsItem = {
      label: "My glyph sets", // TODO: translate
      id: "my-glyph-sets",
      content: html.div(),
    };

    const accordionItems = [
      {
        label: translate("sources.labels.location"),
        id: "location",
        content: this.fontSourceInput,
      },
      {
        label: "Group by", // TODO: translate
        id: "group-by",
        content: this._makeGroupByUI(),
      },
      this._projectGlyphSetsItem,
      this._myGlyphSetsItem,
    ];

    accordionItems.forEach(
      (item) =>
        (item.open = !this.fontOverviewSettings.closedNavigationSections.has(item.id))
    );

    accordion.items = accordionItems;

    this.appendChild(accordion);

    this.fontOverviewSettingsController.addKeyListener("projectGlyphSets", (event) =>
      this._updateProjectGlyphSets()
    );
    this.fontOverviewSettingsController.addKeyListener("myGlyphSets", (event) =>
      this._updateMyGlyphSets()
    );
    this._updateProjectGlyphSets();
    this._updateMyGlyphSets();
  }

  _makeGroupByUI() {
    return this._makeCheckboxUI("groupByKeys", groupByProperties);
  }

  _updateProjectGlyphSets() {
    this._projectGlyphSetsItem.content = this._makeProjectGlyphSetsUI();
  }

  _updateMyGlyphSets() {
    this._myGlyphSetsItem.content = this._makeMyGlyphSetsUI();
  }

  _makeProjectGlyphSetsUI() {
    const projectGlyphSets = Object.entries(
      this.fontOverviewSettings.projectGlyphSets
    ).map(([key, value]) => ({
      key,
      label: value.label,
    }));

    return html.div({ class: "glyph-set-container" }, [
      this._makeCheckboxUI("projectGlyphSetSelection", projectGlyphSets),
      html.button(
        {
          class: "add-glyph-set-button",
          onclick: (event) => this._addProjectGlyphSet(event),
        },
        ["Add glyph set"]
      ),
    ]);
  }

  _makeMyGlyphSetsUI() {
    const myGlyphSets = [];
    return html.div({ class: "glyph-set-container" }, [
      this._makeCheckboxUI("myGlyphSetSelection", myGlyphSets),
      html.button(
        {
          class: "add-glyph-set-button",
          onclick: (event) => this._addMyGlyphSet(event),
        },
        ["Add glyph set"]
      ),
    ]);
  }

  _makeCheckboxUI(settingsKey, glyphSets) {
    let checkboxController = this._checkboxControllers[settingsKey];
    if (!checkboxController) {
      checkboxController = makeCheckboxController(
        this.fontOverviewSettingsController,
        settingsKey
      );
      this._checkboxControllers[settingsKey] = checkboxController;
    }

    return html.div({}, [
      ...glyphSets.map(({ key, label }) =>
        labeledCheckbox(label, checkboxController, key)
      ),
    ]);
  }

  async _addProjectGlyphSet(event) {
    const glyphSet = await runGlyphSetDialog();
    // XXXX
  }

  async _addMyGlyphSet(event) {
    const glyphSet = await runGlyphSetDialog();
    // XXXX
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

function makeCheckboxController(settingsController, settingsKey) {
  const settings = settingsController.model;

  const checkboxController = new ObservableController(
    Object.fromEntries(settings[settingsKey].map((key) => [key, true]))
  );

  checkboxController.addListener((event) => {
    if (!event.senderInfo?.sentFromSettings) {
      settings[settingsKey] = Object.entries(checkboxController.model)
        .filter(([key, value]) => value)
        .map(([key, value]) => key);
    }
  });

  settingsController.addKeyListener(settingsKey, (event) => {
    checkboxController.withSenderInfo({ sentFromSettings: true }, () => {
      Object.entries(checkboxController.model).forEach(([key, value]) => {
        checkboxController.model[key] = event.newValue.includes(key);
      });
    });
  });

  return checkboxController;
}

const glyphSetPresets = [
  {
    provider: "Google Fonts",
    glyphSets: [
      { name: "Basic Latin", url: "https://xxxxx" },
      { name: "Greek", url: "https://yyyy" },
    ],
  },
];

async function runGlyphSetDialog() {
  const dialog = await dialogSetup("Add glyph set", "", [
    { title: translate("dialog.cancel"), isCancelButton: true },
    { title: translate("dialog.add"), isDefaultButton: true },
  ]);

  const contentStyle = `
  .glyph-set-dialog-content {
    display: grid;
    gap: 0.5em;
    grid-template-columns: max-content auto;
    align-items: center;
    width: 30em;
  }
  `;

  dialog.appendStyle(contentStyle);

  const dialogController = new ObservableController();

  const presetMenuItems = glyphSetPresets.map((providerGroup) => ({
    title: providerGroup.provider,
    getItems: () =>
      providerGroup.glyphSets.map((glyphSet) => ({
        title: glyphSet.name,
        callback: () => {
          dialogController.model.name = glyphSet.name;
          dialogController.model.url = glyphSet.url;
          dialogController.model.fileType = glyphSet.fileType || "auto-detect";
        },
      })),
  }));

  dialog.setContent(
    html.div({ class: "glyph-set-dialog-content" }, [
      html.div(),
      new PopupMenu("Choose preset", () => presetMenuItems),
      ...labeledTextInput("Name", dialogController, "name"),
      ...labeledTextInput("URL", dialogController, "url"),
      ...labeledTextInput("File type", dialogController, "fileType"), // XXXX should be popu
      ...labeledTextInput("Note", dialogController, "note"),
    ])
  );
  const result = await dialog.run();
  console.log(result);
}
