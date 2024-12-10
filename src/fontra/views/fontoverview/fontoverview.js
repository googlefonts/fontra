import { FontController } from "../core/font-controller.js";
import * as html from "../core/html-utils.js";
import { getRemoteProxy } from "../core/remote.js";
import { makeDisplayPath } from "../core/view-utils.js";
import { translate } from "/core/localization.js";
import { message } from "/web-components/modal-dialog.js";

export class FontOverviewController {
  static async fromWebSocket() {
    const pathItems = window.location.pathname.split("/").slice(3);
    const displayPath = makeDisplayPath(pathItems);
    document.title = `Fontra Font Overview — ${decodeURI(displayPath)}`;
    const projectPath = pathItems.join("/");
    const protocol = window.location.protocol === "http:" ? "ws" : "wss";
    const wsURL = `${protocol}://${window.location.host}/websocket/${projectPath}`;

    const remoteFontEngine = await getRemoteProxy(wsURL);
    const fontOverviewController = new FontOverviewController(remoteFontEngine);
    remoteFontEngine.receiver = fontOverviewController;
    remoteFontEngine.onclose = (event) =>
      fontOverviewController.handleRemoteClose(event);
    remoteFontEngine.onerror = (event) =>
      fontOverviewController.handleRemoteError(event);
    await fontOverviewController.start();
    return fontOverviewController;
  }

  constructor(font) {
    this.fontController = new FontController(font);
  }

  async start() {
    await this.fontController.initialize();

    const sidebarContainer = document.querySelector("#sidebar-container");
    const panelContainer = document.querySelector("#panel-container");

    const sidebarElement = html.div({}, [translate("Font Overview sidebar")]);
    sidebarContainer.appendChild(sidebarElement);

    const panelElement = html.div(
      {
        class: "font-overview-panel",
        id: "font-overview-panel",
      },
      [translate("Font Overview container")]
    );

    panelContainer.appendChild(panelElement);
  }

  async messageFromServer(headline, msg) {
    // don't await the dialog result, the server doesn't need an answer
    message(headline, msg);
  }
}
