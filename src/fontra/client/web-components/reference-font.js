import { ObservableController } from "/core/observable-object.js";
import { UnlitElement, div, span } from "/core/unlit.js";
import { fileNameExtension } from "/core/utils.js";
import { themeColorCSS } from "./theme-support.js";
import { UIList } from "./ui-list.js";

const fontTypeMapping = {
  ttf: "truetype",
  otf: "opentype",
  woff: "woff",
  woff2: "woff2",
};

export class ReferenceFont extends UnlitElement {
  static styles = `
    :host {
      display: grid;
      padding: 1em;
      gap: 1em;

      white-space: normal;
    }

    .title {
      font-weight: bold;
    }
  `;

  constructor() {
    super();
    this.fontCounter = 0;
    this.controller = new ObservableController();
  }

  get model() {
    return this.controller.model;
  }

  render() {
    const columnDescriptions = [
      {
        key: "fileName",
        title: "file name",
      },
    ];
    const filesUIList = new UIList();
    filesUIList.columnDescriptions = columnDescriptions;
    filesUIList.minHeight = "6em";
    filesUIList.onFilesDrop = (files) => {
      const fileItems = [...files]
        .filter((file) => {
          const fileExtension = fileNameExtension(file.name).toLowerCase();
          return fileExtension in fontTypeMapping;
        })
        .map((file) => {
          return {
            fileName: file.name,
            file: file,
            fontName: `ReferenceFont${++this.fontCounter}`,
          };
        });
      filesUIList.setItems(fileItems);
      filesUIList.setSelectedItemIndex(0, true);
    };
    filesUIList.addEventListener("listSelectionChanged", async () => {
      const fileItem = filesUIList.getSelectedItem();
      if (!fileItem) {
        this.model.referenceFontName = undefined;
        return;
      }
      const file = fileItem.file;
      const fileExtension = fileNameExtension(file.name);
      if (!fileItem.fontFace) {
        const fontURL = makeFontFaceURL(
          await asBase64Data(file),
          fontTypeMapping[fileExtension]
        );
        fileItem.fontFace = new FontFace(fileItem.fontName, fontURL, {});
        document.fonts.add(fileItem.fontFace);
        await fileItem.fontFace.load();
      }
      this.model.referenceFontName = fileItem.fontName;
    });
    filesUIList.addEventListener("deleteKey", () => {
      const index = filesUIList.getSelectedItemIndex();
      const items = [...filesUIList.items];
      const fileItem = items[index];
      document.fonts.delete(fileItem.fontFace);
      items.splice(index, 1);
      filesUIList.setItems(items);
    });

    const content = [
      div({ class: "title" }, ["Reference font"]),
      div({}, [
        "Drop one or more .ttf, .otf, .woff or .woff2 files in the field below:",
      ]),
      filesUIList,
    ];
    return content;
  }
}

function makeFontFaceURL(fontData, fontType) {
  return `url(data:font/${fontType};base64,${fontData})`;
}

async function asBase64Data(file) {
  const data = await readFileAsync(file);
  return btoa(data);
}

function readFileAsync(file) {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result);
    };

    reader.onerror = reject;

    reader.readAsBinaryString(file);
  });
}

customElements.define("reference-font", ReferenceFont);
