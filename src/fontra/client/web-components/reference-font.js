import { themeColorCSS } from "./theme-support.js";
import { UnlitElement, div, span } from "/core/unlit.js";
import { ObservableController } from "/core/observable-object.js";

const colors = {
  "drop-area-color": ["#eee", "#333"],
  "drop-area-drag-over-color": ["#ccc", "#111"],
  "drop-area-text-color": ["black", "white"],
};

const dropText = "Drop a font file here";

const fontTypeMapping = {
  ttf: "truetype",
  otf: "opentype",
  woff: "woff",
  woff2: "woff2",
};

export class ReferenceFont extends UnlitElement {
  static styles = `
    ${themeColorCSS(colors)}

    :host {
      display: grid;
      padding: 1em;
      gap: 1em;

      white-space: normal;
    }

    #container {
      display: grid;
      gap: 1em;
    }

    #drop-area {
      display: flex;
      justify-content: center;
      align-items: center;

      background-color: var(--drop-area-color);
      color: var(--drop-area-text-color);

      border-radius: 1em;
      height: 5em;
      text-align: center;
    }

    #drop-area.drag-over {
      background-color: var(--drop-area-drag-over-color);
    }

    #drop-text {
    }
  `;

  constructor() {
    super();
    this.controller = new ObservableController();
  }

  get model() {
    return this.controller.model;
  }

  render() {
    const content = [
      div(
        {
          id: "drop-area",

          ondrop: (event) => this.handleDrop(event),
          ondragover: (event) => this.handleDragOver(event),
          ondragleave: (event) => this.handleDragLeave(event),
        },
        ["Drop a font file here"]
      ),
      div({ id: "drop-text" }, [""]),
    ];
    return content;
  }

  async handleDrop(event) {
    event.preventDefault();
    const dropArea = this.shadowRoot.querySelector("#drop-area");
    const dropText = this.shadowRoot.querySelector("#drop-text");
    for (const file of event.dataTransfer.files) {
      const fileExtension = file.name.split(".").pop()?.toLowerCase();
      if (fileExtension in fontTypeMapping) {
        dropText.innerText = file.name;
        this.model.referenceFontURL = makeFontFaceURL(
          await asBase64Data(file),
          fontTypeMapping[fileExtension]
        );

        this.hasFont = true;
      } else {
        dropText.innerHTML = `Can't use “${file.name}” as a font`;
        this.model.referenceFontURL = null;
        this.hasFont = false;
      }
      break;
    }
  }

  handleDragOver(event) {
    const dropArea = this.shadowRoot.querySelector("#drop-area");
    dropArea.classList.add("drag-over");
    event.preventDefault();
  }

  handleDragLeave(event) {
    const dropArea = this.shadowRoot.querySelector("#drop-area");
    dropArea.classList.remove("drag-over");
    event.preventDefault();
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
