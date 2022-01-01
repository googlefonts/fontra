export class SceneView {

  constructor(model, drawFunc) {
    this.model = model;
    this.drawFunc = drawFunc;
    this.subviews = [];
    this.visible = true;
  }

  draw(canvasController) {
    if (!this.visible) {
      return;
    }
    this.subviews.forEach(view => view.draw(canvasController));
    if (this.drawFunc === undefined) {
      return;
    }
    canvasController.context.save();
    this.drawFunc(this.model, canvasController);
    canvasController.context.restore();
  }

}
