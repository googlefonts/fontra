import { BaseTool } from "./edit-tools-base.js";

export class PowerRulerTool extends BaseTool {
  iconPath = "/images/ruler.svg";
  identifier = "power-ruler-tool";

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
