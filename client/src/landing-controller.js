import { getRemoteProxy } from "./remote.js";
import { parseCookies } from "/src/utils.js";
import { List } from "./ui-list.js";


export class LandingController {

  static async fromURL(url) {
    const loginForm = document.querySelector("#login-form-container");
    const logoutForm = document.querySelector("#logout-form-container");
    const logoutButton = document.querySelector("#logout-button");
    const loginFailureMessage = document.querySelector("#login-failure-message");

    const cookies = parseCookies(document.cookie);

    const username = cookies["fontra-username"];
    const token = cookies["fontra-authorization-token"];
    const loginFailed = cookies["fontra-authorization-failed"] == "true";

    if (username) {
      const usernameField = document.querySelector("#login-username");
      usernameField.value = username;
    }
    loginForm.classList.toggle("hidden", !!token);
    logoutForm.classList.toggle("hidden", !token);
    if (token && username) {
      logoutButton.textContent = `Log out ${username}`;
    }
    loginFailureMessage.classList.toggle("hidden", !loginFailed);

    if (token) {
      const remoteFontEngine = await getRemoteProxy(url, token);
      const landingController = new LandingController(remoteFontEngine);
      await landingController.setup();
      return landingController;
    }
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
