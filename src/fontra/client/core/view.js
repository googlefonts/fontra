import { FontController } from "../core/font-controller.js";
import { getRemoteProxy } from "../core/remote.js";
import { makeDisplayPath } from "../core/view-utils.js";
import { Backend } from "./backend-api.js";
import { ensureLanguageHasLoaded } from "/core/localization.js";
import { message } from "/web-components/modal-dialog.js";

export class ViewController {
  static titlePattern(displayPath) {
    return `Fontra — ${decodeURI(displayPath)}`;
  }
  static async fromBackend() {
    const pathItems = window.location.pathname.split("/").slice(3);
    const displayPath = makeDisplayPath(pathItems);
    document.title = this.titlePattern(displayPath);
    const projectPath = pathItems.join("/");

    await ensureLanguageHasLoaded;

    const remoteFontEngine = await Backend.remoteFont(projectPath);
    const controller = new this(remoteFontEngine);
    remoteFontEngine.receiver = controller;
    remoteFontEngine.on("close", (event) => controller.handleRemoteClose(event));
    remoteFontEngine.on("error", (event) => controller.handleRemoteError(event));
    await controller.start();
    return controller;
  }

  constructor(font) {
    this.fontController = new FontController(font);
  }

  async start() {
    console.error("ViewController.start() not implemented");
  }

  async externalChange(change, isLiveChange) {
    await this.fontController.applyChange(change, true);
    this.fontController.notifyChangeListeners(change, isLiveChange, true);
  }

  async reloadData(reloadPattern) {}

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
