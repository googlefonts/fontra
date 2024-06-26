import Panel from "./panel.js";
import * as html from "/core/html-utils.js";
import { findNestedActiveElement, throttleCalls } from "/core/utils.js";

export default class GlyphNotesPanel extends Panel {
  identifier = "glyph-notes";
  iconPath = "/tabler-icons/notes.svg";

  static styles = `
    .sidebar-glyph-notes {
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.5em;
      padding: 1em;
    }

    #glyph-notes-textarea {
      background-color: var(--text-input-background-color);
      color: var(--text-input-foreground-color);
      border-radius: 0.25em;
      border: 0.5px solid lightgray;
      outline: none;
      padding: 0.2em 0.5em;
      font-family: fontra-ui-regular, sans-serif;
      font-size: 1.1rem;
      resize: none;
      overflow-x: auto;
    }
  `;

  constructor(editorController) {
    super(editorController);
    this.throttledUpdate = throttleCalls((senderID) => this.update(), 100);
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;

    this.sceneController.sceneSettingsController.addKeyListener(
      ["selectedGlyphName", "selection", "fontLocationSourceMapped", "glyphLocation"],
      (event) => this.throttledUpdate()
    );
  }

  getContentElement() {
    return html.div(
      {
        class: "sidebar-glyph-notes",
      },
      [
        html.createDomElement("textarea", {
          rows: 1,
          wrap: "off",
          id: "glyph-notes-textarea",
        }),
      ]
    );
  }

  async update() {
    this.glyphNotesElement = this.contentElement.querySelector("#glyph-notes-textarea");
    const sceneController = this.sceneController;

    const varGlyphController =
      await sceneController.sceneModel.getSelectedVariableGlyphController();
    const varGlyph = varGlyphController?.glyph;
    console.log("varGlyph: ", varGlyph);

    if (!varGlyph) {
      this.glyphNotesElement.value = "";
      this.glyphNotesElement.disabled = true;
      this.fixGlyphNotesHeight();
      return;
    } else {
      this.glyphNotesElement.disabled = false;
    }

    let undoLabel;
    if (varGlyph.note === undefined) {
      this.glyphNotesElement.value = "";
      undoLabel = "add glyph note";
    } else {
      this.glyphNotesElement.value = varGlyph.note;
      undoLabel = "update glyph note";
    }
    this.fixGlyphNotesHeight();

    let timeout = null;
    this.glyphNotesElement.addEventListener(
      "input",
      () => {
        clearTimeout(timeout);
        this.fixGlyphNotesHeight();
        const notes = this.glyphNotesElement.value;

        timeout = setTimeout(async function () {
          await sceneController.editGlyphAndRecordChanges((glyph) => {
            glyph.note = notes;
            return undoLabel;
          });
        }, 1500);
      },
      false
    );
  }

  fixGlyphNotesHeight() {
    // This adapts the text entry height to its content
    this.glyphNotesElement.style.height = "auto";
    this.glyphNotesElement.style.height =
      this.glyphNotesElement.scrollHeight + 14 + "px";
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
    }
  }
}

customElements.define("panel-glyph-notes", GlyphNotesPanel);
