import { ObservableController } from "/core/observable-object.js";
import { UnlitElement, div, input, label, span } from "/core/unlit.js";
import { fileNameExtension, withTimeout } from "/core/utils.js";
import { themeColorCSS } from "./theme-support.js";
import { UIList } from "./ui-list.js";
import { dialog } from "/web-components/modal-dialog.js";

const fontFileExtensions = new Set(["ttf", "otf", "woff", "woff2"]);

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
    this.listController = new ObservableController({
      selectedFontIndex: null,
      fontList: [],
    });
    this.listController.synchronizeWithLocalStorage("fontra.reference-font.");
    this.listController.addKeyListener("fontList", (event) =>
      this._fontListChangedHandler(event)
    );
    this.controller = new ObservableController({
      referenceFontName:
        this.listController.model.fontList[this.listController.model.selectedFontIndex]
          ?.fontIdentifier,
    });
    garbageCollectUnusedFiles(this.listController.model.fontList);
  }

  get model() {
    return this.controller.model;
  }

  render() {
    const columnDescriptions = [
      {
        key: "uplodadedFileName",
        title: "file name",
      },
    ];
    this.filesUIList = new UIList();

    this.filesUIList.columnDescriptions = columnDescriptions;
    this.filesUIList.itemEqualFunc = (a, b) => a.fontIdentifier == b.fontIdentifier;

    this.filesUIList.minHeight = "6em";

    this.filesUIList.onFilesDrop = (files) => this._filesDropHandler(files);

    this.filesUIList.addEventListener("listSelectionChanged", () =>
      this._listSelectionChangedHandler()
    );

    this.filesUIList.addEventListener("deleteKey", () =>
      this._deleteSelectedItemHandler()
    );
    this.filesUIList.addEventListener("deleteKeyAlt", () => this._deleteAllHandler());

    this.filesUIList.setItems([...this.listController.model.fontList]);
    if (this.listController.model.selectedFontIndex != null) {
      this.filesUIList.setSelectedItemIndex(
        this.listController.model.selectedFontIndex,
        true
      );
    }

    const content = [
      div({ class: "title" }, ["Reference font"]),
      div({}, [
        "Drop one or more .ttf, .otf, .woff or .woff2 files in the field below:",
      ]),
      this.filesUIList,
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

  _fontListChangedHandler(event) {
    if (event.senderInfo?.senderID === this) {
      return;
    }
    this.listController.model.selectedFontIndex = null;

    const itemsByFontID = Object.fromEntries(
      this.filesUIList.items.map((item) => [item.fontIdentifier, item])
    );

    const newItems = event.newValue.map((item) => {
      const existingItem = itemsByFontID[item.fontIdentifier];
      if (existingItem) {
        item = existingItem;
        delete itemsByFontID[item.fontIdentifier];
      }
      return item;
    });

    for (const leftoverItem of Object.values(itemsByFontID)) {
      garbageCollectFontItem(leftoverItem);
    }

    this.filesUIList.setItems(newItems, true);
    if (this.filesUIList.getSelectedItemIndex() === undefined) {
      this.model.referenceFontName = undefined;
    }
  }

  async _filesDropHandler(files) {
    const fontItemsInvalid = [];
    const fontItems = [...files]
      .filter((file) => {
        const fileExtension = fileNameExtension(file.name).toLowerCase();
        const fileTypeSupported = fontFileExtensions.has(fileExtension);
        if (!fileTypeSupported) {
          fontItemsInvalid.push(file);
        }
        return fileTypeSupported;
      })
      .map((file) => {
        return {
          uplodadedFileName: file.name,
          droppedFile: file,
          objectURL: URL.createObjectURL(file),
          fontIdentifier: `ReferenceFont-${crypto.randomUUID()}`,
        };
      });

    if (fontItemsInvalid.length) {
      const dialogTitle = `The following item${
        fontItemsInvalid.length > 1 ? "s" : ""
      } can't be used as a reference font:`;
      const dialogMessage = fontItemsInvalid
        .map((file) => {
          return `- ${file.name}`;
        })
        .join("\n");
      dialog(dialogTitle, dialogMessage, [{ title: "Okay" }], 5000);
    }

    const newSelectedItemIndex = this.filesUIList.items.length;
    const newItems = [...this.filesUIList.items, ...fontItems];
    this.filesUIList.setItems(newItems);
    this.filesUIList.setSelectedItemIndex(newSelectedItemIndex, true);

    const writtenFontItems = [...this.listController.model.fontList];
    try {
      for (const fontItem of fontItems) {
        await writeFontFileToOPFS(fontItem.fontIdentifier, fontItem.droppedFile);
        delete fontItem.droppedFile;
        writtenFontItems.push(fontItem);
      }
    } catch (error) {
      dialog("Could not store some reference fonts", error.toString(), [
        { title: "Okay" },
      ]);
    }

    // Only notify the list controller *after* the files have been written,
    // or else other tabs will try to read the font data too soon and will
    // fail
    this.listController.setItem("fontList", cleanFontItems(writtenFontItems), {
      senderID: this,
    });
  }

  async _listSelectionChangedHandler() {
    const fontItem = this.filesUIList.getSelectedItem();
    if (!fontItem) {
      this.model.referenceFontName = undefined;
      this.listController.model.selectedFontIndex = null;
      return;
    }

    this.listController.model.selectedFontIndex =
      this.filesUIList.getSelectedItemIndex();

    if (!fontItem.fontFace) {
      if (!fontItem.objectURL) {
        fontItem.objectURL = URL.createObjectURL(
          await readFontFileFromOPFS(fontItem.fontIdentifier)
        );
      }
      fontItem.fontFace = new FontFace(
        fontItem.fontIdentifier,
        `url(${fontItem.objectURL})`,
        {}
      );
      document.fonts.add(fontItem.fontFace);
      await fontItem.fontFace.load();
    }
    this.model.referenceFontName = fontItem.fontIdentifier;
  }

  async _deleteSelectedItemHandler() {
    await this._deleteItemOrAll(this.filesUIList.getSelectedItemIndex());
  }

  async _deleteAllHandler() {
    await this._deleteItemOrAll(undefined);
  }

  async _deleteItemOrAll(index) {
    const fontItems = [...this.filesUIList.items];

    let itemsToDelete, newItems;
    if (index !== undefined) {
      itemsToDelete = [fontItems[index]];
      fontItems.splice(index, 1);
      newItems = fontItems;
    } else {
      itemsToDelete = fontItems;
      newItems = [];
    }

    this.listController.model.selectedFontIndex = null;
    this.model.referenceFontName = undefined;

    this.filesUIList.setItems(newItems);

    // Only share those fonts that we successfully stored before
    const storedFontIDs = new Set(
      this.listController.model.fontList.map((item) => item.fontIdentifier)
    );
    this.listController.setItem(
      "fontList",
      cleanFontItems(newItems.filter((item) => storedFontIDs.has(item.fontIdentifier))),
      {
        senderID: this,
      }
    );

    for (const fontItem of itemsToDelete) {
      garbageCollectFontItem(fontItem);
      await deleteFontFileFromOPFS(fontItem.fontIdentifier);
    }
  }
}

function cleanFontItems(fontItems) {
  return fontItems.map((fontItem) => {
    return {
      uplodadedFileName: fontItem.uplodadedFileName,
      fontIdentifier: fontItem.fontIdentifier,
    };
  });
}

async function garbageCollectUnusedFiles(fontItems) {
  const usedFontIdentifiers = new Set(
    fontItems.map((fontItem) => fontItem.fontIdentifier)
  );
  const fileNames = await listFontFileNamesInOPFS();
  for (const fileName of fileNames) {
    if (!usedFontIdentifiers.has(fileName)) {
      // Unused font file
      deleteFontFileFromOPFS(fileName);
    }
  }
}

function garbageCollectFontItem(fontItem) {
  if (fontItem.fontFace) {
    document.fonts.delete(fontItem.fontFace);
  }
  if (fontItem.objectURL) {
    URL.revokeObjectURL(fontItem.objectURL);
  }
}

async function getOPFSFontsDir() {
  const root = await navigator.storage.getDirectory();
  return await root.getDirectoryHandle("reference-fonts", { create: true });
}

async function listFontFileNamesInOPFS() {
  const fontsDir = await getOPFSFontsDir();
  const fileNames = [];
  for await (const [name, handle] of fontsDir.entries()) {
    fileNames.push(name);
  }
  return fileNames;
}

async function readFontFileFromOPFS(fileName) {
  const fontsDir = await getOPFSFontsDir();
  const fileHandle = await fontsDir.getFileHandle(fileName);
  return await fileHandle.getFile();
}

async function deleteFontFileFromOPFS(fileName) {
  const fontsDir = await getOPFSFontsDir();
  await fontsDir.removeEntry(fileName);
}

let opfsSupportsCreateWritable;

async function writeFontFileToOPFS(fileName, file) {
  if (opfsSupportsCreateWritable == undefined || opfsSupportsCreateWritable === true) {
    const error = await writeFontFileToOPFSAsync(fileName, file);
    if (opfsSupportsCreateWritable == undefined) {
      opfsSupportsCreateWritable = !error;
    }
  }
  if (opfsSupportsCreateWritable === false) {
    await writeFontFileToOPFSInWorker(fileName, file);
  }
}

async function writeFontFileToOPFSAsync(fileName, file) {
  const fontsDir = await getOPFSFontsDir();
  const fileHandle = await fontsDir.getFileHandle(fileName, { create: true });
  if (!fileHandle.createWritable) {
    // This is the case in Safari (as of august 2023)
    return "OPFS does not support fileHandle.createWritable()";
  }
  const writable = await fileHandle.createWritable();
  await writable.write(file);
  await writable.close();
}

let worker;

function getWriteWorker() {
  if (!worker) {
    const path = "/core/opfs-write-worker.js"; // + `?${Math.random()}`;
    worker = new Worker(path);
  }
  return worker;
}

async function writeFontFileToOPFSInWorker(fileName, file) {
  return await withTimeout(
    new Promise((resolve, reject) => {
      const worker = getWriteWorker();
      worker.onmessage = (event) => {
        if (event.data.error) {
          reject(event.data.error);
        } else {
          resolve(event.data.returnValue);
        }
      };
      worker.postMessage({ path: ["reference-fonts", fileName], file });
    }),
    5000
  );
}

customElements.define("reference-font", ReferenceFont);
