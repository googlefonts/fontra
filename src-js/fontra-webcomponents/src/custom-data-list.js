import { getCustomDataInfoFromKey } from "@fontra/core/font-info-data.js";
import * as html from "@fontra/core/html-utils.js";
import { SimpleElement } from "@fontra/core/html-utils.js";
import { translate } from "@fontra/core/localization.js";
import { ObservableController } from "@fontra/core/observable-object.js";
import { DefaultFormatter, labeledTextInput } from "@fontra/core/ui-utils.js";
import { zip } from "@fontra/core/utils.js";
import { dialogSetup, message } from "@fontra/web-components/modal-dialog.js";
import { UIList } from "@fontra/web-components/ui-list.js";

// TODO: Refactor this, copy from panel-axes.js
function arraysEqual(arrayA, arrayB) {
  if (arrayA.length !== arrayB.length) {
    return false;
  }
  for (const [itemA, itemB] of zip(arrayA, arrayB)) {
    if (itemA !== itemB) {
      return false;
    }
  }
  return true;
}

// TODO: Refactor this, copy from panel-axes.js
function updateRemoveButton(list, buttons) {
  list.addEventListener("listSelectionChanged", (event) => {
    buttons.disableRemoveButton = list.getSelectedItemIndex() === undefined;
  });
}

export class CustomDataList extends SimpleElement {
  static styles = `

  .fontra-ui-font-info-sources-panel-list-element {
    min-width: max-content;
    max-width: 29.5em; // 4.5 + 25
    max-height: 12em;
  }
  `;

  constructor(controller, customDataInfos) {
    super();
    this.contentElement = this.shadowRoot.appendChild(html.div());
    this.controller = controller;
    this.customDataInfos = customDataInfos;
    this.render();
  }

  buildCustomDataList() {
    const customDataNames = this.customDataInfos.map((info) => info.key);
    const model = this.controller.model;

    const makeItem = ([key, value]) => {
      const item = new ObservableController({ key: key, value: value });
      item.addListener((event) => {
        const sortedItems = [...labelList.items];
        sortedItems.sort(
          (a, b) =>
            (customDataNames.indexOf(a.key) != -1
              ? customDataNames.indexOf(a.key)
              : customDataNames.length) -
            (customDataNames.indexOf(b.key) != -1
              ? customDataNames.indexOf(b.key)
              : customDataNames.length)
        );

        if (!arraysEqual(labelList.items, sortedItems)) {
          labelList.setItems(sortedItems);
        }

        const newCustomData = sortedItems.map((customData) => {
          return { ...customData };
        });
        model.customData = newCustomData;
      });
      return item.model;
    };

    const sortedItems = Object.entries(model);
    sortedItems.sort(
      (a, b) =>
        (customDataNames.indexOf(a[0]) != -1
          ? customDataNames.indexOf(a[0])
          : customDataNames.length) -
        (customDataNames.indexOf(b[0]) != -1
          ? customDataNames.indexOf(b[0])
          : customDataNames.length)
    );
    const items = sortedItems?.map(makeItem) || [];

    const labelList = new UIList();
    labelList.classList.add("fontra-ui-font-info-sources-panel-list-element");
    labelList.style = `min-width: 12em;`;
    labelList.columnDescriptions = [
      {
        key: "key",
        title: "Key", // TODO: translation
        width: "14em",
        editable: true,
        continuous: false,
      },
      {
        key: "value",
        title: "Value", // TODO: translation
        width: "14em",
        editable: true,
        continuous: false,
      },
    ];
    labelList.showHeader = true;
    labelList.minHeight = "5em";
    labelList.setItems(items);

    const deleteSelectedItem = () => {
      const index = labelList.getSelectedItemIndex();
      if (index === undefined) {
        return;
      }
      const items = [...labelList.items];
      items.splice(index, 1);
      labelList.setItems(items);
      const newCustomData = items.map((customData) => {
        return { ...customData };
      });
      model.customData = newCustomData;
      addRemoveButton.scrollIntoView({
        behavior: "auto",
        block: "nearest",
        inline: "nearest",
      });
      labelList.setSelectedItemIndex(items.length - 1);
    };

    labelList.addEventListener("deleteKey", deleteSelectedItem);
    const addRemoveButton = html.createDomElement("add-remove-buttons", {
      addButtonCallback: async () => {
        const currentKeys = labelList.items.map((customData) => {
          return customData.key;
        });
        const { key, value } = await this._customDataPropertiesRunDialog(
          this.customDataInfos,
          currentKeys
        );
        if (key == undefined || value == undefined) {
          return;
        }
        const newItem = makeItem([key, value]);
        const newItems = [...labelList.items, newItem];
        model.customData = newItems.map((label) => {
          return { ...label };
        });
        labelList.setItems(newItems);
        labelList.editCell(newItems.length - 1, "key");
        addRemoveButton.scrollIntoView({
          behavior: "auto",
          block: "nearest",
          inline: "nearest",
        });
      },
      removeButtonCallback: deleteSelectedItem,
      disableRemoveButton: true,
    });

    updateRemoveButton(labelList, addRemoveButton);

    return html.div({ style: "display: grid; grid-gap: 0.3em;" }, [
      labelList,
      addRemoveButton,
    ]);
  }

  render() {
    this.contentElement.appendChild(this.buildCustomDataList());
  }

  async _customDataPropertiesRunDialog(customDataInfos, currentKeys) {
    const title = translate("Add advanced information"); // TODO: translation
    const customDataNames = this.customDataInfos.map((info) => info.key);

    const validateInput = () => {
      warningElement.innerText = "";
      infoElement.innerText = "";
      const customDataKey =
        nameController.model.customDataKey == ""
          ? undefined
          : nameController.model.customDataKey;
      const customDataValue =
        nameController.model.customDataValue == ""
          ? undefined
          : nameController.model.customDataValue;

      const setWarning = (warning) => {
        warningElement.innerText = warning;
        dialog.defaultButton.classList.toggle("disabled", true);
      };

      if (customDataKey == undefined && customDataValue == undefined) {
        // We don't want to start with a warning,
        // but need to disable the button -> therefore set it to empty string.
        setWarning("");
        return;
      }

      if (customDataKey == undefined) {
        setWarning("⚠️ Key is empty, please enter."); // TODO: translation
        return;
      }

      if (!customDataNames.includes(customDataKey)) {
        // We know we have a key, but it is not supported, yet.
        setWarning(`⚠️ ${translate("Key not supported, yet.")}`); // TODO: translation
        return;
      }

      // At that point, we know we have a valid key -> add key info if exists.
      const customDataInfo = getCustomDataInfoFromKey(customDataKey, customDataInfos);
      infoElement.innerText = customDataInfo?.info || "";
      if (customDataInfo?.infoLink) {
        infoElement.innerText += "\n";
        infoElement.appendChild(
          html.a(
            {
              href: customDataInfo?.infoLink,
              target: "_blank",
              style:
                "font-style: italic; color: var(--foreground-color); text-decoration: underline;",
            },
            ["Link to reference"] // TODO: translation
          )
        );
      }

      if (currentKeys.includes(customDataKey)) {
        setWarning(`⚠️ ${translate("Key already in use.")}`); // TODO: translation
        return;
      }

      const formatter = customDataInfo?.formatter || DefaultFormatter;
      const result = formatter.fromString(customDataValue);
      if (customDataKey != undefined && result.value == undefined) {
        const msg = result.error ? ` "${result.error}"` : "";
        setWarning(`⚠️ Invalid value${msg}`); // TODO: translation
        return;
      }

      // If we reach here, everything is fine:
      dialog.defaultButton.classList.toggle("disabled", false);
    };

    const nameController = new ObservableController({
      customDataKey: undefined,
      suggestedCustomDataKey: "Please enter a key",
      customDataValue: undefined,
      suggestedCustomDataValue: "Please enter a value",
    });

    nameController.addKeyListener("customDataKey", (event) => {
      validateInput();
      const customDataInfo = getCustomDataInfoFromKey(
        nameController.model.customDataKey,
        customDataInfos
      );
      if (customDataInfo) {
        const customDataFormatter = customDataInfo.formatter || DefaultFormatter;
        nameController.model.customDataValue = customDataFormatter.toString(
          customDataInfo.getDefaultFunction()
        );
      }
    });

    nameController.addKeyListener("customDataValue", (event) => {
      validateInput();
    });

    const { contentElement, warningElement, infoElement } =
      this._customDataPropertiesContentElement(nameController, customDataNames);

    const dialog = await dialogSetup(title, null, [
      { title: translate("dialog.cancel"), isCancelButton: true },
      { title: translate("dialog.add"), isDefaultButton: true, disabled: true },
    ]);
    dialog.setContent(contentElement);

    setTimeout(
      () => contentElement.querySelector("#source-name-text-input")?.focus(),
      0
    );

    if (!(await dialog.run())) {
      // User cancelled
      return {};
    }

    const customDataInfo = getCustomDataInfoFromKey(
      nameController.model.customDataKey,
      customDataInfos
    );
    const formatter = customDataInfo?.formatter || DefaultFormatter;

    return {
      key: nameController.model.customDataKey,
      value: formatter.fromString(nameController.model.customDataValue).value,
    };
  }

  _customDataPropertiesContentElement(nameController, customDataNames) {
    const warningElement = html.div({
      id: "warning-text",
      style: `grid-column: 1 / -1; min-height: 1.5em;`,
    });

    const infoElement = html.div({
      id: "info-text",
      style: `grid-column: 1 / -1; min-height: 1.5em;`,
    });

    const contentElement = html.div(
      {
        style: `overflow: hidden;
          white-space: nowrap;
          display: grid;
          gap: 0.5em;
          grid-template-columns: max-content auto;
          align-items: center;
          height: 100%;
          min-height: 0;
        `,
      },
      [
        ...labeledTextInput(translate("Key"), nameController, "customDataKey", {
          placeholderKey: "suggestedCustomDataKey",
          choices: customDataNames,
        }),
        ...labeledTextInput(translate("Value"), nameController, "customDataValue", {
          placeholderKey: "suggestedCustomDataValue",
        }),
        html.br(),
        infoElement,
        warningElement,
      ]
    );
    return { contentElement, warningElement, infoElement };
  }
}

customElements.define("custom-data-list", CustomDataList);
