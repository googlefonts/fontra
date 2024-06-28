import Panel from "./panel.js";
import * as html from "/core/html-utils.js";
import { throttleCalls } from "/core/utils.js";

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

    this.setupGlyphNotesElement();
    this.sceneController.sceneSettingsController.addKeyListener(
      ["selectedGlyphName", "selection"],
      (event) => this.throttledUpdate()
    );

    this.sceneController.addCurrentGlyphChangeListener((event) => {
      this.throttledUpdate(event.senderID);
    });
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

  setupGlyphNotesElement() {
    this.glyphNotesElement = this.contentElement.querySelector("#glyph-notes-textarea");
    this.glyphNotesHeaderElement =
      this.contentElement.querySelector("#glyph-notes-header");

    this.glyphNotesElement.addEventListener("change", async () => {
      saveGlyphNotes(
        this.sceneController,
        this.glyphNotesElement.value,
        this.undoLabel
      );
    });

    this.glyphNotesElement.addEventListener("input", async () => {
      this.fixGlyphNotesHeight();
    });
  }

  async update() {
    // This method is called when the panel is opened or when the selected glyph changes.
    // Therefore we need to update the glyph notes text area with the current glyph notes
    const varGlyphController =
      await this.sceneController.sceneModel.getSelectedVariableGlyphController();
    const varGlyph = varGlyphController?.glyph;

    this.glyphNotesHeaderElement.innerHTML = varGlyph
      ? `Glyph note (${varGlyph.name})`
      : `Glyph note`;
    const glyphNote = varGlyph?.customData["fontra.glyph.note"] ?? "";
    this.undoLabel = glyphNote ? "update glyph note" : "add glyph note";
    this.glyphNotesElement.value = glyphNote;
    this.glyphNotesElement.disabled = varGlyph ? false : true;
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
      // Delay focusing until after the panel slide in animation,
      // or else the sliding animation will look glitchy
      setTimeout(() => this.glyphNotesElement.focus(), 200);
    }
  }
}

async function saveGlyphNotes(sceneController, notes, undoLabel) {
  const varGlyphController =
    await sceneController.sceneModel.getSelectedVariableGlyphController();
  // this check is neccecary because it may fail when clicking outside of a glyph
  if (!varGlyphController) {
    return;
  }
  await sceneController.editGlyphAndRecordChanges((glyph) => {
    glyph.customData["fontra.glyph.note"] = notes;
    return undoLabel;
  });
}

customElements.define("panel-glyph-notes", GlyphNotesPanel);
