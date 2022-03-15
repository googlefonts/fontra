import { getRemoteProxy } from "./remote.js";


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
    const projectList = await this.remoteObject.getProjectList();
    console.log("projectList", projectList);
  }

}
