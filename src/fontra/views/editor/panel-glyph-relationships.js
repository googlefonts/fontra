import Panel from "./panel.js";
import * as html from "/core/html-utils.js";
import { throttleCalls } from "/core/utils.js";

export default class GlyphRelationshipsPanel extends Panel {
  identifier = "glyph-relationships";
  iconPath = "/tabler-icons/binary-tree-2.svg";

  static styles = `
    .sidebar-glyph-relationships {
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 0.5em;
      padding: 1em;
    }
  `;

  constructor(editorController) {
    super(editorController);
    this.throttledUpdate = throttleCalls((senderID) => this.update(senderID), 100);
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;

    // this.setupGlyphRelationshipsElement();

    // this.sceneController.sceneSettingsController.addKeyListener(
    //   ["selectedGlyphName", "selection"],
    //   (event) => this.throttledUpdate()
    // );

    // this.sceneController.addCurrentGlyphChangeListener((event) => {
    //   this.throttledUpdate(event.senderID);
    // });
  }

  getContentElement() {
    return html.div(
      {
        class: "sidebar-glyph-relationships",
      },
      [
        "Hewllo",
        // html.div({ class: "glyph-note-header", id: "glyph-note-header" }, [
        //   "Glyph note",
        // ]),
        // html.createDomElement("textarea", {
        //   rows: 1,
        //   wrap: "off",
        //   id: "glyph-note-textarea",
        // }),
      ]
    );
  }

  setupGlyphRelationshipsElement() {
    //
  }

  async update() {
    // const varGlyphController =
    //   await this.sceneController.sceneModel.getSelectedVariableGlyphController();
    // const varGlyph = varGlyphController?.glyph;
    // this._selectedGlyphName = varGlyph?.name;
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
    }
  }
}

customElements.define("panel-glyph-relationships", GlyphRelationshipsPanel);
