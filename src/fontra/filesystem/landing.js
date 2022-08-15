import { loaderSpinner } from "/core/loader-spinner.js";
import { getRemoteProxy } from "/core/remote.js";
import { autoReload, parseCookies, themeSwitchFromLocalStorage } from "/core/utils.js";


export async function startupLandingPage(authenticateFunc) {
  if (autoReload()) {
    // Will reload
    return;
  }
  themeSwitchFromLocalStorage();

  const cookies = parseCookies(document.cookie);
  const protocol = window.location.protocol === "http:" ? "ws" : "wss";
  const wsURL = `${protocol}://${window.location.host}/websocket/`;

  if (authenticateFunc) {
    if (!authenticateFunc()) {
      return;
    }
  }
  const remoteFontEngine = await getRemoteProxy(wsURL);
  const projectList = await loaderSpinner(remoteFontEngine.getProjectList());
  const projectListContainer = document.querySelector("#project-list");
  projectListContainer.classList.remove("hidden");


  for (const project of projectList) {
    const projectElement = document.createElement("a")
    projectElement.href = "/editor/-/" + project;
    projectElement.className = "project-item";
    projectElement.append(project);
    projectListContainer.appendChild(projectElement);
  }
}
