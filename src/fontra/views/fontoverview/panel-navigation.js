import { groupByKeys, groupByProperties } from "/core/glyph-organizer.js";
import * as html from "/core/html-utils.js";
import { translate } from "/core/localization.js";
import { ObservableController } from "/core/observable-object.js";
import { difference, symmetricDifference, union } from "/core/set-ops.js";
import {
  labeledCheckbox,
  labeledPopupSelect,
  labeledTextInput,
  popupSelect,
} from "/core/ui-utils.js";
import { GlyphSearchField } from "/web-components/glyph-search-field.js";
import { IconButton } from "/web-components/icon-button.js"; // required for the icon buttons
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

      .checkbox-group {
        width: 100%;
        display: grid;
        grid-template-columns: auto auto;
        justify-content: space-between;
      }

      icon-button {
        width: 1.4em;
        height: 1.4em;
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
        content: await this._makeFontSourcePopup(),
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

  async _makeFontSourcePopup() {
    const fontSources = await this.fontController.getSources();

    const selectedSourceIdentifier = () =>
      this.fontController.fontSourcesInstancer.getLocationIdentifierForLocation(
        this.fontOverviewSettings.fontLocationSource
      );

    const options = this.fontController
      .getSortedSourceIdentifiers()
      .map((fontSourceIdentifier) => ({
        value: fontSourceIdentifier,
        label: fontSources[fontSourceIdentifier].name,
      }));

    const controller = new ObservableController({
      value: selectedSourceIdentifier(),
    });

    this.fontOverviewSettingsController.addKeyListener(
      "fontLocationSource",
      (event) => {
        if (!event.senderInfo?.sentFromInput) {
          controller.model.value = selectedSourceIdentifier();
        }
      }
    );

    controller.addKeyListener("value", (event) => {
      const fontSourceIdentifier = event.newValue;
      const sourceLocation = {
        ...fontSources[fontSourceIdentifier]?.location,
      }; // A font may not have any font sources, therefore the ?-check
      this.fontOverviewSettingsController.setItem(
        "fontLocationSource",
        sourceLocation,
        { sentFromInput: true }
      );
    });

    return popupSelect(controller, "value", options);
  }

  _makeGroupByUI() {
    return this._makeCheckboxUI("groupByKeys", groupByProperties);
  }

  _updateProjectGlyphSets() {
    this._projectGlyphSetsItem.content.innerHTML = "";
    this._projectGlyphSetsItem.content.appendChild(this._makeProjectGlyphSetsUI());
  }

  _updateMyGlyphSets() {
    this._myGlyphSetsItem.content.innerHTML = "";
    this._myGlyphSetsItem.content.appendChild(this._makeMyGlyphSetsUI());
  }

  _makeProjectGlyphSetsUI() {
    const projectGlyphSets = sortedGlyphSets(
      this.fontOverviewSettings.projectGlyphSets
    );

    return html.div({ class: "glyph-set-container" }, [
      this._makeCheckboxUI("projectGlyphSetSelection", projectGlyphSets),
      html.input({
        type: "button",
        class: "add-glyph-set-button",
        value: "Add glyph set",
        onclick: (event) => this._addProjectGlyphSet(event),
      }),
    ]);
  }

  _makeMyGlyphSetsUI() {
    const myGlyphSets = sortedGlyphSets(this.fontOverviewSettings.myGlyphSets);

    return html.div({ class: "glyph-set-container" }, [
      this._makeCheckboxUI("myGlyphSetSelection", myGlyphSets),
      html.input({
        type: "button",
        class: "add-glyph-set-button",
        value: "Add glyph set",
        onclick: (event) => this._addMyGlyphSet(event),
      }),
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

    return html.div({ class: "checkbox-group" }, [
      ...glyphSets
        .map(({ key, label, extraItem }) => [
          labeledCheckbox(label, checkboxController, key),
          extraItem ? extraItem : html.div(),
        ])
        .flat(),
    ]);
  }

  async _addProjectGlyphSet(event) {
    const glyphSet = await runGlyphSetDialog();
    if (!glyphSet) {
      return;
    }
    this.fontOverviewSettings.projectGlyphSets = {
      ...this.fontOverviewSettings.projectGlyphSets,
      [glyphSet.url]: glyphSet,
    };
  }

  async _addMyGlyphSet(event) {
    const glyphSet = await runGlyphSetDialog();
    if (!glyphSet) {
      return;
    }
    this.fontOverviewSettings.myGlyphSets = {
      ...this.fontOverviewSettings.myGlyphSets,
      [glyphSet.url]: glyphSet,
    };
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
    curator: "Google Fonts",
    glyphSets: [
      {
        name: "GF Arabic Core",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Arabic_Core.txt",
      },
      {
        name: "GF Arabic Plus",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Arabic_Plus.txt",
      },
      {
        name: "GF Cyrillic Core",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Cyrillic_Core.txt",
      },
      {
        name: "GF Cyrillic Historical",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Cyrillic_Historical.txt",
      },
      {
        name: "GF Cyrillic Plus",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Cyrillic_Plus.txt",
      },
      {
        name: "GF Cyrillic Pro",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Cyrillic_Pro.txt",
      },
      {
        name: "GF Greek AncientMusicalSymbols",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Greek_AncientMusicalSymbols.txt",
      },
      {
        name: "GF Greek Archaic",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Greek_Archaic.txt",
      },
      {
        name: "GF Greek Coptic",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Greek_Coptic.txt",
      },
      {
        name: "GF Greek Core",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Greek_Core.txt",
      },
      {
        name: "GF Greek Expert",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Greek_Expert.txt",
      },
      {
        name: "GF Greek Plus",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Greek_Plus.txt",
      },
      {
        name: "GF Greek Pro",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Greek_Pro.txt",
      },
      {
        name: "GF Latin African",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Latin_African.txt",
      },
      {
        name: "GF Latin Beyond",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Latin_Beyond.txt",
      },
      {
        name: "GF Latin Core",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Latin_Core.txt",
      },
      {
        name: "GF Latin Kernel",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Latin_Kernel.txt",
      },
      {
        name: "GF Latin Plus",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Latin_Plus.txt",
      },
      {
        name: "GF Latin PriAfrican",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Latin_PriAfrican.txt",
      },
      {
        name: "GF Latin Vietnamese",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Latin_Vietnamese.txt",
      },
      {
        name: "GF Phonetics APA",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Phonetics_APA.txt",
      },
      {
        name: "GF Phonetics DisorderedSpeech",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Phonetics_DisorderedSpeech.txt",
      },
      {
        name: "GF Phonetics IPAHistorical",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Phonetics_IPAHistorical.txt",
      },
      {
        name: "GF Phonetics IPAStandard",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Phonetics_IPAStandard.txt",
      },
      {
        name: "GF Phonetics SinoExt",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_Phonetics_SinoExt.txt",
      },
      {
        name: "GF TransLatin Arabic",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_TransLatin_Arabic.txt",
      },
      {
        name: "GF TransLatin Pinyin",
        url: "https://raw.githubusercontent.com/googlefonts/glyphsets/main/data/results/txt/nice-names/GF_TransLatin_Pinyin.txt",
      },
    ],
  },
];

async function runGlyphSetDialog() {
  const glyphSetInfo = { fileType: "auto-detect" };
  const dialogController = new ObservableController(glyphSetInfo);

  const validateInput = () => {
    let valid = true;
    let url;
    try {
      url = new URL(dialogController.model.url);
    } catch (e) {
      valid = false;
    }
    if (url?.pathname.length <= 1 || !url?.hostname.includes(".")) {
      valid = false;
    }
    if (!dialogController.model.name) {
      valid;
    }
    // TODO: warningsElement: say what/why it's invalid
    dialog.defaultButton.classList.toggle("disabled", !valid);
  };

  dialogController.addListener((event) => validateInput());

  const dialog = await dialogSetup("Add glyph set", "", [
    { title: translate("dialog.cancel"), isCancelButton: true },
    { title: translate("dialog.add"), isDefaultButton: true, disabled: true },
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

  const presetMenuItems = glyphSetPresets.map((curatorGroup) => ({
    title: curatorGroup.curator,
    getItems: () =>
      curatorGroup.glyphSets.map((glyphSet) => ({
        title: glyphSet.name,
        callback: () => {
          dialogController.model.name = glyphSet.name;
          dialogController.model.url = glyphSet.url;
          dialogController.model.fileType = glyphSet.fileType || "auto-detect";
        },
      })),
  }));

  const fileTypeOptions = [
    { value: "auto-detect", label: "auto-detect" },
    { value: "glyph-names", label: "Glyph names (whitespace-separated)" },
    { value: "csv", label: "CSV (comma- or semicolon-separated)" },
    { value: "tsv", label: "TSV (tab-separated)" },
  ];

  dialog.setContent(
    html.div({ class: "glyph-set-dialog-content" }, [
      html.div(),
      new PopupMenu("Choose preset", () => presetMenuItems),
      ...labeledTextInput("Name", dialogController, "name"),
      ...labeledTextInput("URL", dialogController, "url"),
      ...labeledPopupSelect("File type", dialogController, "fileType", fileTypeOptions),
      ...labeledTextInput("Note", dialogController, "note"),
    ])
  );
  const result = await dialog.run();
  return !!(result && glyphSetInfo.name && glyphSetInfo.url) ? glyphSetInfo : null;
}

function sortedGlyphSets(glyphSets) {
  return Object.entries(glyphSets)
    .map(([key, value]) => ({
      key,
      label: value.name,
      extraItem: value.url
        ? html.createDomElement("icon-button", {
            src: "/tabler-icons/menu-2.svg",
            onclick: (event) => console.log("---", value),
            // "data-tooltip": "XXXXX",
            // "data-tooltipposition": "left",
          })
        : null,
    }))
    .sort((a, b) => {
      if (a.label == b.label) {
        return 0;
      }
      if (!a.key) {
        return -1;
      } else if (!b.key) {
        return 1;
      }
      return a.label < b.label ? -1 : 1;
    });
}
