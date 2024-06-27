import { recordChanges } from "../core/change-recorder.js";
import { ChangeCollector, applyChange, consolidateChanges } from "../core/changes.js";
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
      text-wrap: wrap;
    }

    .fontra-ui-panel-glyph-notes-header {
      overflow-x: unset;
      font-weight: bold;
      grid-column: 1 / span 2;
      text-align: left;
      display: grid;
      grid-template-columns: auto auto;
      justify-content: space-between;
    }
  `;

  constructor(editorController) {
    super(editorController);
    this.throttledUpdate = throttleCalls((senderID) => this.update(senderID), 100);
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;
    this.glyphNotesElement = this.contentElement.querySelector("#glyph-notes-textarea");
    this.glyphNotesHeaderElement =
      this.contentElement.querySelector("#glyph-notes-header");

    this.sceneController.sceneSettingsController.addKeyListener(
      ["selectedGlyphName", "selection", "fontLocationSourceMapped", "glyphLocation"],
      (event) => this.throttledUpdate()
    );

    this.undoLable = "add glyph note";
    this.isFocused = true;

    this.glyphNotesElement.addEventListener("focusout", () => {
      this.isFocused = false;
      saveGlyphNotes(
        this.sceneController,
        this.glyphNotesElement.value,
        this.undoLable
      );
    });

    this.glyphNotesElement.addEventListener(
      "focus",
      () => {
        this.isFocused = true;
      },
      false
    );

    this.timeout = null;
    // Save the glyph notes after 3 seconds of inactivity and
    // only if the text area is focused
    this.glyphNotesElement.addEventListener(
      "keyup",
      () => {
        clearTimeout(this.timeout);
        this.fixGlyphNotesHeight();
        this.timeout = setTimeout(async () => {
          if (this.isFocused) {
            await saveGlyphNotes(
              this.sceneController,
              this.glyphNotesElement.value,
              this.undoLable
            );
          }
        }, 3000);
      },
      false
    );
  }

  getContentElement() {
    return html.div(
      {
        class: "sidebar-glyph-notes",
      },
      [
        html.div(
          { class: "fontra-ui-panel-glyph-notes-header", id: "glyph-notes-header" },
          ["Glyph note"]
        ),
        html.createDomElement("textarea", {
          rows: 1,
          wrap: "off",
          id: "glyph-notes-textarea",
        }),
      ]
    );
  }

  async update() {
    // This method is called when the panel is opened or when the selected glyph changes.
    // Therefore we need to update the glyph notes text area with the current glyph notes
    // And set isFocused back to true
    this.isFocused = true;

    const varGlyphController =
      await this.sceneController.sceneModel.getSelectedVariableGlyphController();
    const varGlyph = varGlyphController?.glyph;

    if (!varGlyph) {
      this.glyphNotesElement.value = "";
      this.glyphNotesElement.disabled = true;
      this.glyphNotesHeaderElement.innerHTML = `Glyph note`;
      this.fixGlyphNotesHeight();
      return;
    } else {
      this.glyphNotesElement.disabled = false;
      this.glyphNotesHeaderElement.innerHTML = `Glyph note (${varGlyph.name})`;
    }

    const glyphNote = varGlyph.customData["fontra.glyph.note"];
    this.undoLable = glyphNote ? "update glyph note" : "add glyph note";
    this.glyphNotesElement.value = glyphNote ? glyphNote : "";
    this.fixGlyphNotesHeight();
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

async function saveGlyphNotes(sceneController, notes, undoLable) {
  await sceneController.editGlyphAndRecordChanges((glyph) => {
    glyph.customData["fontra.glyph.note"] = notes;
    return undoLable;
  });
}

customElements.define("panel-glyph-notes", GlyphNotesPanel);
