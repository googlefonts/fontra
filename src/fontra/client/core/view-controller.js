import { registerAction } from "./actions.js";
import { Backend } from "./backend-api.js";
import { FontController } from "./font-controller.js";
import { getRemoteProxy } from "./remote.js";
import { makeDisplayPath } from "./view-utils.js";
import { ensureLanguageHasLoaded } from "/core/localization.js";
import { message } from "/web-components/modal-dialog.js";

export class ViewController {
  static titlePattern(displayPath) {
    return `Fontra — ${decodeURI(displayPath)}`;
  }
  static async fromBackend() {
    const pathItems = new URL(window.location).searchParams.get("project").split("/");
    const displayPath = makeDisplayPath(pathItems);
    document.title = this.titlePattern(displayPath);
    const projectPath = pathItems.join("/");

    await ensureLanguageHasLoaded;

    const remoteFontEngine = await Backend.remoteFont(projectPath);
    const controller = new this(remoteFontEngine);
    remoteFontEngine.on("close", (event) => controller.handleRemoteClose(event));
    remoteFontEngine.on("error", (event) => controller.handleRemoteError(event));
    remoteFontEngine.on("messageFromServer", (headline, msg) =>
      controller.messageFromServer(headline, msg)
    );
    remoteFontEngine.on("externalChange", (change, isLiveChange) =>
      controller.externalChange(change, isLiveChange)
    );
    remoteFontEngine.on("reloadData", (reloadPattern) =>
      controller.reloadData(reloadPattern)
    );

    await controller.start();
    controller.afterStart();
    return controller;
  }

  constructor(font) {
    this.fontController = new FontController(font);
  }

  async start() {
    await this.fontController.initialize();
  }

  afterStart() {
    for (const format of this.fontController.backendInfo.projectManagerFeatures[
      "export-as"
    ] || []) {
      registerAction(
        `action.export-as.${format}`,
        {
          topic: "0035-action-topics.export-as",
        },
        (event) => this.fontController.exportAs({ format })
      );
    }
  }

  /**
   * The following methods are called by the remote object, on receipt of a
   * method call from the backend.
   */

  /**
   * Apply a change from the backend.
   *
   * Something happened to the current font outside of this controller, and we
   * need to change ourselves in order to reflect that change.
   *
   * @param {*} change
   * @param {*} isLiveChange
   */

  async externalChange(change, isLiveChange) {
    await this.fontController.applyChange(change, true);
    this.fontController.notifyChangeListeners(change, isLiveChange, true);
  }

  /**
   * Reload some part of the font
   *
   * This is called when the backend tells us that something has changed, and
   * we need to reload the font to reflect that change.
   *
   * @param {*} reloadPattern
   */
  async reloadData(reloadPattern) {}

  /**
   *
   * Notify the user of a message from the server.
   *
   * @param {*} headline
   * @param {*} msg
   */
  async messageFromServer(headline, msg) {
    // don't await the dialog result, the server doesn't need an answer
    message(headline, msg);
  }

  handleRemoteClose(event) {
    //
  }

  handleRemoteError(event) {
    //
  }
}
