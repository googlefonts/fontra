import {
  makeSparseLocation,
  mapAxesFromUserSpaceToSourceSpace,
} from "../core/var-model.js";
import { groupByKeys, groupByProperties } from "/core/glyph-organizer.js";
import * as html from "/core/html-utils.js";
import { translate } from "/core/localization.js";
import { ObservableController } from "/core/observable-object.js";
import { glyphSetDataFormats } from "/core/parse-glyph-set.js";
import { difference, symmetricDifference, union } from "/core/set-ops.js";
import {
  labeledCheckbox,
  labeledPopupSelect,
  labeledTextInput,
  popupSelect,
} from "/core/ui-utils.js";
import { GlyphSearchField } from "/web-components/glyph-search-field.js";
import { IconButton } from "/web-components/icon-button.js"; // required for the icon buttons
import { showMenu } from "/web-components/menu-panel.js";
import { dialogSetup, message } from "/web-components/modal-dialog.js";
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
    this._glyphSetErrorButtons = {};

    this._setupUI();
  }

  async _setupUI() {
    this.searchField = new GlyphSearchField({
      settingsController: this.fontOverviewSettingsController,
      searchStringKey: "searchString",
    });

    this.appendChild(this.searchField);

    const accordion = new Accordion();
    this.accordion = accordion;

    accordion.appendStyle(`
      .glyph-set-container {
        display: grid;
        justify-items: left;
        gap: 0.5em;
      }

      .checkbox-group {
        width: 100%;
        display: grid;
        grid-template-columns: auto auto;
        justify-content: space-between;
      }

      .glyphset-button-group {
        justify-self: end;
        display: grid;
        grid-template-columns: auto auto;
        gap: 0.2em;
      }

      icon-button {
        width: 1.3em;
        height: 1.3em;
      }

      .glyphset-error-button {
        color: var(--fontra-light-red-color);
        opacity: 0;
      }

      .glyphset-error-button.glyphset-error {
        opacity: 1;
      }

      .font-source-location-container {
        display: grid;
        gap: 0.5em;
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
      auxiliaryHeaderElement: this._makeAddGlyphSetButton(
        true,
        "Add a glyph set to the project"
      ),
    };

    this._myGlyphSetsItem = {
      label: "My glyph sets", // TODO: translate
      id: "my-glyph-sets",
      content: html.div(),
      auxiliaryHeaderElement: this._makeAddGlyphSetButton(
        false,
        "Add a glyph set to my sets"
      ),
    };

    const accordionItems = [
      {
        label: translate("sources.labels.location"),
        id: "location",
        content: html.div({ class: "font-source-location-container" }, [
          await this._makeFontSourcePopup(),
          await this._makeFontSourceSliders(),
        ]),
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

    this.fontOverviewSettingsController.addKeyListener("glyphSetErrors", (event) => {
      const diffKeys = symmetricDifference(
        new Set(Object.keys(event.oldValue)),
        Object.keys(event.newValue)
      );
      for (const key of diffKeys) {
        const errorButton = this._glyphSetErrorButtons[key];
        errorButton.classList.toggle("glyphset-error", !!event.newValue[key]);
      }
    });
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

    this.locationControllerPopup = new ObservableController({
      value: selectedSourceIdentifier(),
    });

    this.fontOverviewSettingsController.addKeyListener(
      "fontLocationSource",
      (event) => {
        if (!event.senderInfo?.sentFromInput) {
          this.locationControllerPopup.model.value = selectedSourceIdentifier();
        }
      }
    );

    this.locationControllerPopup.addKeyListener("value", (event) => {
      const fontSourceIdentifier = event.newValue;
      this.sourceLocation = {
        ...fontSources[fontSourceIdentifier]?.location,
      }; // A font may not have any font sources, therefore the ?-check
      // TODO: set the sliders controller. The following does not work:
      //this.locationControllerSliders.setItem(this.sourceLocation);
      this.fontOverviewSettingsController.setItem(
        "fontLocationSource",
        this.sourceLocation,
        { sentFromInput: true }
      );
    });

    return popupSelect(this.locationControllerPopup, "value", options);
  }

  async _makeFontSourceSliders() {
    const locationAxes = mapAxesFromUserSpaceToSourceSpace(
      this.fontController.axes.axes
    );

    this.locationControllerSliders = new ObservableController({
      ...this.sourceLocation,
    });

    const locationElement = html.createDomElement("designspace-location", {
      style: `grid-column: 1 / -1;
        min-height: 0;
        overflow: auto;
        height: 100%;
      `,
    });
    locationElement.axes = locationAxes;
    locationElement.controller = this.locationControllerSliders;

    this.locationControllerSliders.addListener((event) => {
      const sourceLocation = { ...this.locationControllerSliders.model };
      const fontSourceIdentifier =
        this.fontController.fontSourcesInstancer.getLocationIdentifierForLocation(
          sourceLocation
        );
      this.locationControllerPopup.setItem("value", fontSourceIdentifier, {
        sentBySlider: true,
      });
      this.fontOverviewSettingsController.setItem(
        "fontLocationSource",
        sourceLocation,
        { sentFromInput: true }
      );
    });

    return locationElement;
  }

  _makeGroupByUI() {
    return this._makeCheckboxUI("groupByKeys", groupByProperties);
  }

  _makeAddGlyphSetButton(isProjectGlyphSet, toolTip) {
    return html.createDomElement("icon-button", {
      "src": "/images/plus.svg",
      "onclick": (event) => this._editGlyphSet(event, isProjectGlyphSet),
      "data-tooltip": toolTip,
      "data-tooltipposition": "bottom",
    });
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
    const projectGlyphSets = this._prepareGlyphSets(
      this.fontOverviewSettings.projectGlyphSets,
      true
    );

    return html.div({ class: "glyph-set-container" }, [
      this._makeCheckboxUI("projectGlyphSetSelection", projectGlyphSets),
    ]);
  }

  _makeMyGlyphSetsUI() {
    const myGlyphSets = this._prepareGlyphSets(
      this.fontOverviewSettings.myGlyphSets,
      false
    );

    return html.div({ class: "glyph-set-container" }, [
      this._makeCheckboxUI("myGlyphSetSelection", myGlyphSets),
    ]);
  }

  _prepareGlyphSets(glyphSets, isProjectGlyphSet) {
    return Object.entries(glyphSets)
      .map(([key, glyphSet]) => ({
        key,
        label: glyphSet.name,
        extraItem: glyphSet.url
          ? html.div({ class: "glyphset-button-group" }, [
              this._makeGlyphSetErrorButton(glyphSet, isProjectGlyphSet),
              this._makeGlyphSetMenuButton(glyphSet, isProjectGlyphSet),
            ])
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

  _makeGlyphSetMenuButton(glyphSet, isProjectGlyphSet) {
    return html.createDomElement("icon-button", {
      src: "/tabler-icons/pencil.svg",
      onclick: (event) => {
        const buttonRect = event.target.getBoundingClientRect();
        showMenu(
          [
            {
              title: "Edit",
              callback: (event) => {
                this._editGlyphSet(event, isProjectGlyphSet, glyphSet);
              },
            },
            {
              title: "Delete",
              callback: (event) => {
                this._deleteGlyphSet(event, isProjectGlyphSet, glyphSet);
              },
            },
            {
              title: `Copy to ${
                isProjectGlyphSet ? "my glyph sets" : "project glyph sets"
              }`,
              callback: (event) => {
                this._copyGlyphSet(event, isProjectGlyphSet, glyphSet);
              },
            },
          ],
          {
            x: buttonRect.left,
            y: buttonRect.bottom,
          }
        );
      },
      // "data-tooltip": "------",
      // "data-tooltipposition": "left",
    });
  }

  _makeGlyphSetErrorButton(glyphSet, isProjectGlyphSet) {
    const errorButton = html.createDomElement("icon-button", {
      class: "glyphset-error-button",
      src: "/tabler-icons/alert-triangle.svg",
      onclick: (event) => {
        const errorMessage = this.fontOverviewSettings.glyphSetErrors[glyphSet.url];
        if (errorMessage) {
          message(`The glyph set “${glyphSet.name}” could not be loaded`, errorMessage);
        }
      },
    });

    this._glyphSetErrorButtons[glyphSet.url] = errorButton;

    return errorButton;
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

  async _editGlyphSet(event, isProjectGlyphSet, glyphSetInfo = null) {
    const glyphSet = await runGlyphSetDialog(glyphSetInfo);
    if (!glyphSet) {
      return;
    }

    if (isProjectGlyphSet) {
      this.accordion.openCloseAccordionItem(this._projectGlyphSetsItem, true);
    } else {
      this.accordion.openCloseAccordionItem(this._myGlyphSetsItem, true);
    }

    const key = isProjectGlyphSet ? "projectGlyphSets" : "myGlyphSets";
    const glyphSets = {
      ...this.fontOverviewSettings[key],
    };
    if (glyphSetInfo?.url) {
      delete glyphSets[glyphSetInfo.url];
    }
    glyphSets[glyphSet.url] = glyphSet;
    this.fontOverviewSettings[key] = glyphSets;
  }

  _deleteGlyphSet(event, isProjectGlyphSet, glyphSetInfo) {
    const key = isProjectGlyphSet ? "projectGlyphSets" : "myGlyphSets";
    const glyphSets = {
      ...this.fontOverviewSettings[key],
    };
    delete glyphSets[glyphSetInfo.url];
    this.fontOverviewSettings[key] = glyphSets;
  }

  _copyGlyphSet(event, isProjectGlyphSet, glyphSet) {
    const fromKey = isProjectGlyphSet ? "projectGlyphSets" : "myGlyphSets";
    const toKey = isProjectGlyphSet ? "myGlyphSets" : "projectGlyphSets";
    this.fontOverviewSettings[toKey] = {
      ...this.fontOverviewSettings[toKey],
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

async function runGlyphSetDialog(glyphSetInfo) {
  glyphSetInfo = { dataFormat: "auto-detect", ...glyphSetInfo };
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

  validateInput();

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
          dialogController.model.dataFormat = glyphSet.dataFormat || "auto-detect";
        },
      })),
  }));

  presetMenuItems.push({
    title: html.span({}, [
      "Suggest glyph set collections",
      html.createDomElement("inline-svg", {
        style: `
          display: inline-block;
          height: 1em;
          width: 1em;
          margin-left: 0.5em;
          transform: translate(0, 0.15em);
        `,
        src: "/tabler-icons/external-link.svg",
      }),
    ]),
    callback: () => {
      window.open("https://github.com/googlefonts/fontra/discussions/1943");
    },
  });

  dialog.setContent(
    html.div({ class: "glyph-set-dialog-content" }, [
      html.div(),
      new PopupMenu("Choose preset", () => presetMenuItems),
      ...labeledTextInput("Name", dialogController, "name"),
      ...labeledTextInput("URL", dialogController, "url"),
      ...labeledPopupSelect(
        "Data format",
        dialogController,
        "dataFormat",
        glyphSetDataFormats
      ),
      ...labeledTextInput("Note", dialogController, "note"),
    ])
  );
  const result = await dialog.run();
  return !!(result && glyphSetInfo.name && glyphSetInfo.url) ? glyphSetInfo : null;
}
