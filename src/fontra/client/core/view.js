import { FontController } from "../core/font-controller.js";
import { getRemoteProxy } from "../core/remote.js";
import { makeDisplayPath } from "../core/view-utils.js";
import { ensureLanguageHasLoaded } from "/core/localization.js";
import { message } from "/web-components/modal-dialog.js";

export class ViewController {
  static titlePattern(displayPath) {
    return `Fontra — ${decodeURI(displayPath)}`;
  }
  static async fromWebSocket() {
    const pathItems = window.location.pathname.split("/").slice(3);
    const displayPath = makeDisplayPath(pathItems);
    document.title = this.titlePattern(displayPath);
    const projectPath = pathItems.join("/");
    const protocol = window.location.protocol === "http:" ? "ws" : "wss";
    const wsURL = `${protocol}://${window.location.host}/websocket/${projectPath}`;

    await ensureLanguageHasLoaded;

    const remoteFontEngine = await getRemoteProxy(wsURL);
    const controller = new this(remoteFontEngine);
    remoteFontEngine.receiver = controller;
    remoteFontEngine.onclose = (event) => controller.handleRemoteClose(event);
    remoteFontEngine.onerror = (event) => controller.handleRemoteError(event);
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
