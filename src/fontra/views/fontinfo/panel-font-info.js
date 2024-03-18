import * as html from "../core/html-utils.js";
import { addStyleSheet } from "../core/html-utils.js";
import { BaseInfoPanel } from "./panel-base.js";
import { Form } from "/web-components/ui-form.js";

const fontInfoFields = [
  // [property name, UI label, type]
  ["familyName", "Family Name", "edit-text"],
  ["versionMajor", "Version Major", "edit-number"],
  ["versionMinor", "Version Minor", "edit-number"],
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
];

addStyleSheet(`
.fontra-ui-font-info-axes-panel {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
  // cursor: pointer;
  // display: grid;
  // grid-template-rows: auto auto;
  // grid-template-columns: max-content max-content max-content max-content auto auto;
  // grid-row-gap: 0.1em;
  // grid-column-gap: 1em;
}
`);

export class FontInfoPanel extends BaseInfoPanel {
  static title = "Font info";
  static id = "font-info-panel";

  setupUI() {
    this.fontController = this.fontInfoController.fontController;

    this.setupFontInfoUI();
  }

  async setupFontInfoUI() {
    const info = await this.fontController.getFontInfo();

    this.infoForm = new Form();
    this.infoForm.className = "fontra-ui-font-info-axes-panel";

    const formContents = [];

    formContents.push(
      ...fontInfoFields.map(([key, label, type]) => {
        return {
          type: type,
          key: key,
          label: label,
          value: info[key],
        };
      })
    );

    this.infoForm.setFieldDescriptions(formContents);

    this.panelElement.innerHTML = "";
    this.panelElement.appendChild(this.infoForm);
  }
}
