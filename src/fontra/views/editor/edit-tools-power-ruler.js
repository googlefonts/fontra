import { BaseTool } from "./edit-tools-base.js";

export class PowerRulerTool extends BaseTool {
  iconPath = "/images/ruler.svg";
  identifier = "power-ruler-tool";

  constructor(editor) {
    super(editor);
    this.fontController = editor.fontController;
    this.glyphRulers = {};
    this.currentGlyphName = undefined;

    this.sceneController.addEventListener("selectedGlyphChanged", () =>
      this.editedGlyphMayHaveChanged()
    );
    this.sceneController.addEventListener("selectedGlyphIsEditingChanged", () =>
      this.editedGlyphMayHaveChanged()
    );

    this.glyphChangeListener = (glyphName) => this.glyphChanged(glyphName);
  }

  editedGlyphMayHaveChanged() {
    const glyphName = this.sceneController.selectedGlyphIsEditing
      ? this.sceneModel.getSelectedGlyphName()
      : undefined;
    if (glyphName !== this.currentGlyphName) {
      this.editedGlyphChanged(glyphName);
    }
  }

  editedGlyphChanged(glyphName) {
    if (this.currentGlyphName) {
      this.fontController.removeGlyphChangeListener(
        this.currentGlyphName,
        this.glyphChangeListener
      );
    }
    if (glyphName) {
      this.fontController.addGlyphChangeListener(glyphName, this.glyphChangeListener);
    }
    this.currentGlyphName = glyphName;
  }

  glyphChanged(glyphName) {
    console.log(glyphName, "changed");
  }

  handleHover(event) {
    this.setCursor();
  }

  setCursor() {
    this.canvasController.canvas.style.cursor = "default";
  }

  async handleDrag(eventStream, initialEvent) {
    console.log(initialEvent);
    const initialX = initialEvent.x;
    const initialY = initialEvent.y;
    const originalOriginX = this.canvasController.origin.x;
    const originalOriginY = this.canvasController.origin.y;
    // this.canvasController.canvas.style.cursor = "grabbing";
    for await (const event of eventStream) {
      // if (event.x === undefined) {
      //   // We can receive non-pointer events like keyboard events: ignore
      //   continue;
      // }
      console.log(event);
      // this.canvasController.requestUpdate();
    }
  }
}
