import { getRemoteProxy } from "./remote.js";
import { parseCookies } from "/src/utils.js";
import { List } from "./ui-list.js";


export class LandingController {

  static async fromURL(wsURL, requireLogin) {
    if (requireLogin) {
      return LandingController.fromURLWithLogin(wsURL);
    } else {
      return LandingController.fromURLAuthenticated(wsURL);
    }
  }

  static async fromURLWithLogin(wsURL, requireLogin) {
    const loginFormContainer = document.querySelector("#login-form-container");
    const logoutForm = document.querySelector("#logout-form-container");
    const logoutButton = document.querySelector("#logout-button");
    const loginFailureMessage = document.querySelector("#login-failure-message");

    const cookies = parseCookies(document.cookie);

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
      return LandingController.fromURLAuthenticated(wsURL);
    }
  }

  static async fromURLAuthenticated(url) {
    const remoteFontEngine = await getRemoteProxy(url);
    const landingController = new LandingController(remoteFontEngine);
    await landingController.setup();
    return landingController;
  }

  constructor(remoteObject) {
    this.remoteObject = remoteObject;
  }

  async setup() {
    this.projectList = await this.remoteObject.getProjectList();
    this.projectListUI = new List("project-list");
    this.projectListUI.container.classList.remove("hidden");
    this.projectListUI.setItems(this.projectList);
    this.projectListUI.addEventListener("rowDoubleClicked", event => this.projectDoubleClick(event));
  }

  projectDoubleClick(event) {
    const selectedProject = this.projectList[this.projectListUI.doubleClickedRowIndex];
    const url = "/projects/" + selectedProject;
    window.open(url);
  }

}
