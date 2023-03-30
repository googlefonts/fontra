import { newObservableObject } from "./observable-object.js";

export const themeModelObject = newObservableObject({ theme: "automatic" });
themeModelObject.synchronizeWithLocalStorage("fontra-");

export function themeSwitchFromLocalStorage() {
  setupThemeOverride(themeModelObject.theme);

  themeModelObject.addEventListener("changed", (event) => {
    if (event.key === "theme") {
      setupThemeOverride(themeModelObject.theme);
    }
  });
}

function setupThemeOverride(value) {
  const rootElement = document.querySelector("html");
  rootElement.classList.remove("light-theme");
  rootElement.classList.remove("dark-theme");
  if (value !== "automatic") {
    rootElement.classList.add(value + "-theme");
  }
}
