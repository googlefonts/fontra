import { recordChanges } from "@fontra/core/change-recorder.js";
import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { ObservableController } from "@fontra/core/observable-object.js";
import { CustomDataList } from "@fontra/web-components/custom-data-list.js";
import { message } from "@fontra/web-components/modal-dialog.js";
import { Accordion } from "@fontra/web-components/ui-accordion.js";
import { Form } from "@fontra/web-components/ui-form.js";
import { BaseInfoPanel } from "./panel-base.js";

const fontInfoFields = [
  // [property name, localization key, type]
  ["familyName", "font-info.familyname", "edit-text"],
  ["copyright", "font-info.copyright", "edit-text"],
  ["trademark", "font-info.trademark", "edit-text"],
  ["description", "font-info.description", "edit-text"],
  ["sampleText", "font-info.sampletext", "edit-text"],
  ["designer", "font-info.designer", "edit-text"],
  ["designerURL", "font-info.designer.url", "edit-text"],
  ["manufacturer", "font-info.manufacturer", "edit-text"],
  ["manufacturerURL", "font-info.manufacturer.url", "edit-text"],
  ["licenseDescription", "font-info.licensedescription", "edit-text"],
  ["licenseInfoURL", "font-info.licenseinfo.url", "edit-text"],
  ["vendorID", "font-info.vendorid", "edit-text"],
  ["versionMajor", "font-info.version.major", "edit-number"],
  ["versionMinor", "font-info.version.minor", "edit-number"],
];

// Please see: ufoInfoAttributesToRoundTripFamilyLevel
const customDataAttributesSupported = [
  "openTypeNameUniqueID",
  "openTypeHeadCreated",
  "openTypeNameVersion",
  "openTypeNamePreferredFamilyName",
  "openTypeNameWWSFamilyName",
  "openTypeOS2CodePageRanges",
  "openTypeOS2UnicodeRanges",
  "openTypeOS2FamilyClass",
  "openTypeOS2Type", // embedding bit
  "postscriptWindowsCharacterSet", // The Windows character set.
];

addStyleSheet(`
.font-info-container {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
}

.fontra-ui-font-info-form {
  padding-bottom: 1em; // This has no effect, sadly. And I don't know why.
}

.fontra-ui-font-info-header {
  font-weight: bold;
  padding-bottom: 0.5em;
}

`);

export class FontInfoPanel extends BaseInfoPanel {
  static title = "font-info.title";
  static id = "font-info-panel";
  static fontAttributes = ["fontInfo", "unitsPerEm"];

  async setupUI() {
    const info = await this.fontController.getFontInfo();

    this.infoForm = new Form();
    this.infoForm.className = "fontra-ui-font-info-form";
    this.infoForm.labelWidth = "max-content";

    this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
      const [rootKey, itemKey] = JSON.parse(fieldItem.key);
      this.editFontInfo(
        (root) => {
          if (itemKey) {
            const subject = root[rootKey];
            subject[itemKey] = value;
          } else {
            root[rootKey] = value;
          }
        },
        `change ${itemKey ? itemKey : rootKey}`
      ); // TODO: translation
    };

    const formContents = [];

    formContents.push(
      ...fontInfoFields.map(([key, loclKey, type]) => {
        return {
          type: type,
          key: JSON.stringify(["fontInfo", key]),
          label: translate(loclKey),
          value: info[key],
          minValue: type === "edit-number" ? 0 : undefined,
          integer: type === "edit-number" ? true : undefined,
          ...(key === "vendorID" ? { width: "4em" } : {}),
        };
      })
    );
    formContents.push({
      type: "edit-number",
      key: JSON.stringify(["unitsPerEm"]),
      label: translate("font-info.upm"),
      value: this.fontController.unitsPerEm,
      minValue: 1,
      integer: true,
    });

    this.infoForm.setFieldDescriptions(formContents);

    const cutomDataController = new ObservableController({ ...info.customData });

    cutomDataController.addListener((event) => {
      this.editFontInfo((root) => {
        root.fontInfo.customData = {};
        for (const item of event.newValue) {
          const key = item["key"];
          if (!customDataAttributesSupported.includes(key)) {
            message(
              translate("Edit Advanced information"), // TODO: translation
              `"${key}" not implemented, yet.` // TODO: translation
            );
            continue;
          }
          root.fontInfo.customData[key] = item["value"];
        }
      }, `edit customData`); // TODO: translation
    });

    const customDataList = new CustomDataList({
      controller: cutomDataController,
      fontObject: info,
      supportedAttributes: customDataAttributesSupported,
    });

    const accordion = new Accordion();
    const accordionItems = [
      {
        label: translate("sources.labels.general"),
        id: "general",
        content: this.infoForm,
        open: true,
      },
      {
        label: translate("Advanced Information"), // TODO: translate
        id: "custom-data",
        content: customDataList,
        open: info.customData || false,
      },
    ];

    accordion.items = accordionItems;

    this.panelElement.innerHTML = "";
    this.panelElement.appendChild(
      html.div({ class: "font-info-container" }, [accordion])
    );
    this.panelElement.focus();
  }

  async editFontInfo(editFunc, undoLabel) {
    const root = {
      fontInfo: await this.fontController.getFontInfo(),
      unitsPerEm: this.fontController.unitsPerEm,
    };
    const changes = recordChanges(root, (root) => {
      editFunc(root);
    });
    if (changes.hasChange) {
      this.postChange(changes.change, changes.rollbackChange, undoLabel);
    }
  }
}
