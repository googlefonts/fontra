import Panel from "./panel.js";
import * as html from "/core/html-utils.js";
import { findNestedActiveElement } from "/core/utils.js";

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

    this.textSettingsController = this.editorController.sceneSettingsController;
    this.sceneController = this.editorController.sceneController;
    this.textSettings = this.editorController.sceneSettingsController.model;

    this.setupGlyphNotesElement();
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

  updateAlignElement(align) {
    for (const el of this.textAlignElement.children) {
      el.classList.toggle("selected", align === el.dataset.align);
    }
  }

  setupGlyphNotesElement() {
    this.glyphNotesElement = this.contentElement.querySelector("#glyph-notes-textarea");
    this.glyphNotesElement.value = this.textSettings.text;

    const updateGlyphNotesElementFromModel = (event) => {
      if (event.senderInfo === this) {
        return;
      }
      this.glyphNotesElement.value = event.newValue;

      // https://github.com/googlefonts/fontra/issues/754
      // In Safari, setSelectionRange() changes the focus. We don't want that,
      // so we make sure to restore the focus to whatever it was.
      const savedActiveElement = findNestedActiveElement();
      this.glyphNotesElement.setSelectionRange(0, 0);
      savedActiveElement?.focus();
    };

    this.textSettingsController.addKeyListener(
      "text",
      updateGlyphNotesElementFromModel,
      true
    );

    this.glyphNotesElement.addEventListener(
      "input",
      () => {
        this.textSettingsController.setItem("text", this.glyphNotesElement.value, this);
        this.textSettings.selectedGlyph = null;
      },
      false
    );

    this.textSettingsController.addKeyListener(
      "text",
      (event) => this.fixGlyphNotesHeight(),
      false
    );
  }

  fixGlyphNotesHeight() {
    // This adapts the text entry height to its content
    this.glyphNotesElement.style.height = "auto";
    this.glyphNotesElement.style.height =
      this.glyphNotesElement.scrollHeight + 14 + "px";
  }

  focusGlyphNotes() {
    this.glyphNotesElement.focus();
  }

  async toggle(on, focus) {
    if (focus) {
      this.focusGlyphNotes();
    }
  }
}

customElements.define("panel-glyph-notes", GlyphNotesPanel);
