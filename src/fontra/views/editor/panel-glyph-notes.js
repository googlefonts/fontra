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
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;

    this.sceneController.sceneSettingsController.addKeyListener(
      ["selectedGlyphName", "selection", "fontLocationSourceMapped", "glyphLocation"],
      (event) => this.update()
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
    this.glyphNotesElement = this.contentElement.querySelector("#glyph-notes-textarea");
    this.glyphNotesHeaderElement =
      this.contentElement.querySelector("#glyph-notes-header");
    const sceneController = this.sceneController;

    const varGlyphController =
      await sceneController.sceneModel.getSelectedVariableGlyphController();
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

    this.glyphNotesElement.value = varGlyph.note ? varGlyph.note : "";
    this.fixGlyphNotesHeight();

    const undoLabel = varGlyph.note ? "update glyph note" : "add glyph note";

    this.timeout = null;
    this.glyphNotesElement.addEventListener(
      "keyup",
      () => {
        clearTimeout(this.timeout);
        this.fixGlyphNotesHeight();
        const notes = this.glyphNotesElement.value;
        this.timeout = setTimeout(async function () {
          await sceneController.editGlyphAndRecordChanges((glyph) => {
            glyph.note = notes;
            return undoLabel;
          });
        }, 1500);
      },
      false
    );

    // The following code does not work correctly
    // await sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
    //   let preDragChanges = new ChangeCollector();
    //   preDragChanges = recordChanges(glyph, (varGlyph) => {
    //     console.log("varGlyph: ", varGlyph);
    //     console.log("varGlyph.note: ", varGlyph.note);
    //     glyph.note = varGlyph.note;
    //   });
    //   let dragChanges = new ChangeCollector();
    //   const initialChanges = recordChanges(glyph, (glyph) => {
    //     glyph.note = this.glyphNotesElement.value;
    //   });
    //   await sendIncrementalChange(initialChanges.change);

    //   let timeout = null;
    //   console.log("preDragChanges: ", preDragChanges);
    //   this.glyphNotesElement.addEventListener(
    //     "keyup",
    //     () => {
    //       clearTimeout(timeout);
    //       this.fixGlyphNotesHeight();
    //       const notes = this.glyphNotesElement.value;
    //       timeout = setTimeout(async function () {
    //         dragChanges = recordChanges(glyph, (glyph) => {
    //           glyph.note = notes;
    //         });
    //         console.log("dragChanges: ", dragChanges);
    //         await sendIncrementalChange(dragChanges.change, true); // true: "may drop"
    //       }, 1500);
    //     },
    //     false
    //   );

    //   const finalChanges = initialChanges.concat(preDragChanges, dragChanges);
    //   console.log("finalChanges: ", finalChanges);

    //   return {
    //     undoLabel: undoLabel,
    //     changes: finalChanges,
    //     broadcast: true,
    //   };
    // });
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
