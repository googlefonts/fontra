import { ObservableController } from "/core/observable-object.js";
import { UnlitElement, div, input, label, span } from "/core/unlit.js";
import { fileNameBasename, fileNameExtension } from "/core/utils.js";
import { themeColorCSS } from "./theme-support.js";
import { UIList } from "./ui-list.js";
import { dialog } from "/web-components/modal-dialog.js";

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

    input[type=text] {
      border-radius: 5px;
      min-width: 4em;
      outline: none;
      border: none;
      background-color: var(--text-input-background-color);
      color: var(--ui-form-input-foreground-color);
      padding: 0.4em;
      font-family: fontra-ui-regular;
      font-feature-settings: "tnum" 1;
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
      const fileItemsInvalid = [];
      const fileItems = [...files]
        .filter((file) => {
          const fileExtension = fileNameExtension(file.name).toLowerCase();
          const fileExtensionSupported = fileExtension in fontTypeMapping;
          if (!fileExtensionSupported) {
            fileItemsInvalid.push(file);
          }
          return fileExtensionSupported;
        })
        .map((file) => {
          return {
            fileName: file.name,
            file: file,
            fontName: `ReferenceFont${++this.fontCounter}`,
          };
        });
      if (fileItemsInvalid.length) {
        const dialogTitle = `The following item${
          fileItemsInvalid.length > 1 ? "s" : ""
        } can't be used as a reference font:`;
        const dialogMessage = fileItemsInvalid
          .map((file) => {
            return `- ${file.name}`;
          })
          .join("\n");
        dialog(
          dialogTitle,
          dialogMessage,
          [
            {
              title: "OK",
            },
          ],
          5000
        );
      }
      fileItems.forEach(async (fileItem) => {
        await saveFontToOPFS(fileItem.file);
        updateFontsUIList();
      });
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
        const fontName = makeFontFaceName(fileItem.fontName);
        const fontURL = makeFontFaceURL(
          await asBase64Data(file),
          fontTypeMapping[fileExtension]
        );
        fileItem.fontFace = new FontFace(fontName, fontURL, {});
        document.fonts.add(fileItem.fontFace);
        await fileItem.fontFace.load();
      }
      this.model.referenceFontName = fileItem.fontName;
    });
    filesUIList.addEventListener("deleteKey", async () => {
      const index = filesUIList.getSelectedItemIndex();
      const items = [...filesUIList.items];
      const fileItem = items[index];
      document.fonts.delete(fileItem.fontFace);
      // update model to trigger canvas update (delete reference font from canvas)
      this.model.referenceFontName = undefined;
      await deleteFontFromOPFS(fileItem);
      updateFontsUIList(true);
    });

    const updateFontsUIList = function (deselect) {
      loadAllFontsFromOPFS().then((items) => {
        filesUIList.setItems([...items]);
        if (deselect === true) {
          filesUIList.setSelectedItemIndex(undefined, true);
        } else {
          if (filesUIList.getSelectedItemIndex() === undefined) {
            filesUIList.setSelectedItemIndex(0, true);
          }
        }
      });
    };

    updateFontsUIList();

    const content = [
      div({ class: "title" }, ["Reference font"]),
      div({}, [
        "Drop one or more .ttf, .otf, .woff or .woff2 files in the field below:",
      ]),
      filesUIList,
      div(
        {
          style: `
            display: grid;
            grid-template-columns: max-content auto;
            align-items: center;
            gap: 0.666em;
            `,
        },
        [
          label({ for: "char-override" }, "Custom character:"),
          input({
            type: "text",
            id: "char-override",
            oninput: (event) => (this.model["charOverride"] = event.target.value),
          }),
        ]
      ),
    ];
    return content;
  }
}

function makeFontFaceName(fontName) {
  let name = fontName;
  // replace all non-alphanumeric characters with hyphen
  name = name.replace(/[^a-zA-Z0-9]/g, "-");
  // remove starting and trailing hyphens
  name = name.replace(/^-+|-+$/g, "");
  return name;
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

async function getOPFSInfo() {
  try {
    return navigator.storage.estimate().then((info) => {
      return {
        free: info.quota - info.usage,
        usage: info.usage,
        percent: Math.round((info.usage / info.quota) * 100),
        quota: info.quota,
      };
    });
  } catch (error) {
    dialog(
      "Unable to retrieve Origin Private File System informations.",
      error.toString(),
      [{ title: "OK" }],
      5000
    );
  }
}

async function getOPFSFontsDir() {
  let root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle("reference-fonts", { create: true });
}

async function listFontsInOPFS() {
  const fontsDir = await getOPFSFontsDir();
  const fonts = [];
  for await (let [name, handle] of fontsDir.entries()) {
    fonts.push({
      name: name,
      handle: handle,
    });
  }
  return fonts;
}

async function loadAllFontsFromOPFS() {
  const fonts = await listFontsInOPFS();
  // console.log(fonts);
  for await (let font of fonts) {
    let fontName = font["name"];
    font["file"] = await loadFontFromOPFS(fontName);
    font["fileName"] = fontName;
    font["fontName"] = fileNameBasename(fontName);
  }
  // console.log(fonts);
  return fonts;
}

async function loadFontFromOPFS(fontName) {
  try {
    const fontsDir = await getOPFSFontsDir();
    const fontFileHandle = await fontsDir.getFileHandle(fontName);
    const fontFileData = await fontFileHandle.getFile();
    const fontFileBuffer = await fontFileData.arrayBuffer();
    const fontFileBlob = new Blob([fontFileBuffer], { type: "font/ttf" });
    const fontFile = new File([fontFileBlob], fontName, { type: "font/ttf" });
    return fontFile;
  } catch (error) {
    dialog(
      "Unable to load font from Origin Private File System.",
      error.toString(),
      [{ title: "OK" }],
      5000
    );
    return null;
  }
}

async function deleteFontFromOPFS(font) {
  const fontsDir = await getOPFSFontsDir();
  try {
    await fontsDir.removeEntry(font.file.name);
  } catch (error) {
    // this happens when the same file is added multiple times.
    // when one of them gets deleted, the file stored in OPFS gets deleted too,
    // subsequent items deletion will throw this exception
    // because the file has already been deleted previously.
    dialog(
      "Unable to delete font file from Origin Private File System.",
      error.toString(),
      [{ title: "OK" }],
      5000
    );
  }
}

async function saveFontToOPFS(file) {
  const info = await getOPFSInfo();
  if (info.free < file.size) {
    dialog(
      "Unable to save font file to Origin Private File System.",
      `There is not enough free space available (${info.percent}% in use).`,
      [{ title: "OK" }],
      5000
    );
  }
  const fontsDir = await getOPFSFontsDir();
  const fontFile = await fontsDir.getFileHandle(file.name, { create: true });
  const fontFileData = await readFileAsync(file);
  const fontFileBinaryData = Uint8Array.from(fontFileData, (char) =>
    char.charCodeAt(0)
  );
  const fontFileIO = await fontFile.createWritable();
  try {
    await fontFileIO.write(fontFileBinaryData);
  } catch (error) {
    dialog(
      "Unable to save font file to Origin Private File System.",
      error.toString(),
      [{ title: "OK" }],
      5000
    );
  } finally {
    await fontFileIO.close();
  }
}

customElements.define("reference-font", ReferenceFont);
