import { recordChanges } from "../core/change-recorder.js";
import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import { Form } from "/web-components/ui-form.js";

const fontInfoFields = [
  // [property name, UI label, type]
  ["familyName", "Family Name", "edit-text"],
  ["copyright", "Copyright", "edit-text"],
  ["trademark", "Trademark", "edit-text"],
  ["description", "Description", "edit-text"],
  ["sampleText", "SampleText", "edit-text"],
  ["designer", "Designer", "edit-text"],
  ["designerURL", "Designer URL", "edit-text"],
  ["manufacturer", "Manufacturer", "edit-text"],
  ["manufacturerURL", "Manufacturer URL", "edit-text"],
  ["licenseDescription", "License Description", "edit-text"],
  ["licenseInfoURL", "License Info URL", "edit-text"],
  ["vendorID", "Vendor ID", "edit-text"],
  ["versionMajor", "Version Major", "edit-number"],
  ["versionMinor", "Version Minor", "edit-number"],
];

addStyleSheet(`
.fontra-ui-font-info-axes-panel {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
}
`);

export class FontInfoPanel extends BaseInfoPanel {
  static title = "Font info";
  static id = "font-info-panel";

  async setupUI() {
    const info = await this.fontController.getFontInfo();

    this.infoForm = new Form();
    this.infoForm.className = "fontra-ui-font-info-axes-panel";
    this.infoForm.labelWidth = "max-content";

    this.infoForm.onFieldChange = async (fieldItem, value, valueStream) => {
      const [rootKey, itemKey] = JSON.parse(fieldItem.key);
      const undoLabel = `change ${itemKey ? itemKey : rootKey}`;

      const root = {
        fontInfo: await this.fontController.getFontInfo(),
        unitsPerEm: this.fontController.unitsPerEm,
      };
      const changes = recordChanges(root, (root) => {
        if (itemKey) {
          const subject = root[rootKey];
          subject[itemKey] = value;
        } else {
          root[rootKey] = value;
        }
      });
      if (changes.hasChange) {
        await this.postChange(changes.change, changes.rollbackChange, undoLabel);
      }
    };

    const formContents = [];

    formContents.push(
      ...fontInfoFields.map(([key, label, type]) => {
        return {
          type: type,
          key: JSON.stringify(["fontInfo", key]),
          label: label,
          value: info[key],
          ...(key === "vendorID" ? { width: "4em" } : {}),
        };
      })
    );
    formContents.push({
      type: "edit-number",
      key: JSON.stringify(["unitsPerEm"]),
      label: "Units Per Em",
      value: this.fontController.unitsPerEm,
    });

    this.infoForm.setFieldDescriptions(formContents);

    this.panelElement.innerHTML = "";
    this.panelElement.appendChild(this.infoForm);
  }
}
