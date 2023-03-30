import { newObservableObject } from "./observable-object.js";

export function themeSwitch(value) {
  const rootElement = document.querySelector("html");
  rootElement.classList.remove("light-theme");
  rootElement.classList.remove("dark-theme");
  if (value !== "automatic") {
    rootElement.classList.add(value + "-theme");
  }
}

export const themeModelObject = newObservableObject({ theme: "automatic" });
themeModelObject.synchronizeWithLocalStorage("fontra-");

export function themeSwitchFromLocalStorage() {
  themeSwitch(themeModelObject.theme);

  themeModelObject.addEventListener("changed", (event) => {
    if (event.key === "theme") {
      themeSwitch(themeModelObject.theme);
    }
  });
}
