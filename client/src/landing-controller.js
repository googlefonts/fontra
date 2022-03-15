import { getRemoteProxy } from "./remote.js";
import { List } from "./ui-list.js";


export class LandingController {

  static async fromURL(url) {
    const remoteFontEngine = await getRemoteProxy(url);
    const landingController = new LandingController(remoteFontEngine);
    return landingController;
  }

  constructor(remoteObject) {
    this.remoteObject = remoteObject;
  }


  async setup() {
    if (await this.remoteObject.getRequireLogin()) {
      // ...
    }
    this.projectList = await this.remoteObject.getProjectList();
    this.projectListUI = new List("project-list");
    this.projectListUI.setItems(this.projectList);
    this.projectListUI.addEventListener("rowDoubleClicked", event => this.projectDoubleClick(event));
  }

  projectDoubleClick(event) {
    const selectedProject = this.projectList[this.projectListUI.doubleClickedRowIndex];
    const url = "/projects/" + selectedProject;
    window.open(url);
  }

}
