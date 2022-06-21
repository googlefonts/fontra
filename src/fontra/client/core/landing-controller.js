import { loaderSpinner } from "./loader-spinner.js";
import { getRemoteProxy } from "./remote.js";
import { autoReload, parseCookies, themeSwitchFromLocalStorage } from "./utils.js";


export class LandingController {

  static async fromWebSocket() {
    if (autoReload()) {
      // Will reload
      return;
    }
    themeSwitchFromLocalStorage();
    const cookies = parseCookies(document.cookie);
    const webSocketPort = parseInt(cookies["websocket-port"]);
    const protocol = window.location.protocol === "http:" ? "ws" : "wss";
    const wsURL = `${protocol}://${window.location.hostname}:${webSocketPort}/`;

    if (cookies["fontra-require-login"] === "false") {
      return LandingController.fromWebSocketURLAuthenticated(wsURL);
    }
    const loginFormContainer = document.querySelector("#login-form-container");
    const logoutForm = document.querySelector("#logout-form-container");
    const logoutButton = document.querySelector("#logout-button");
    const loginFailureMessage = document.querySelector("#login-failure-message");

    const username = cookies["fontra-username"];
    const haveToken = !!cookies["fontra-authorization-token"];
    const loginFailed = cookies["fontra-authorization-failed"] == "true";

    if (username) {
      const usernameField = document.querySelector("#login-username");
      usernameField.value = username;
    }
    loginFormContainer.classList.toggle("hidden", haveToken);
    logoutForm.classList.toggle("hidden", !haveToken);
    if (haveToken && username) {
      logoutButton.textContent = `Log out ${username}`;
    } else {
      const loginForm = document.querySelector("#login-form");
      const url = new URL(window.location);
      loginForm.action = "/login" + url.search;
    }
    loginFailureMessage.classList.toggle("hidden", !loginFailed);
    if (haveToken) {
      return LandingController.fromWebSocketURLAuthenticated(wsURL);
    }
  }

  static async fromWebSocketURLAuthenticated(url) {
    const remoteFontEngine = await getRemoteProxy(url);
    const landingController = new LandingController(remoteFontEngine);
    await landingController.setup();
    return landingController;
  }

  constructor(remoteObject) {
    this.remoteObject = remoteObject;
  }

  async setup() {
    this.projectList = await loaderSpinner(this.remoteObject.getProjectList());
    const projectListContainer = document.querySelector("#project-list");
    projectListContainer.classList.remove("hidden");
    buildProjectList(projectListContainer, this.projectList);
  }

}


function buildProjectList(container, projectList) {
  for (const project of projectList) {
    const projectElement = document.createElement("a")
    projectElement.href = "/editor/-/" + project;
    projectElement.className = "project-item";
    projectElement.append(project);
    container.appendChild(projectElement);
  }
}
