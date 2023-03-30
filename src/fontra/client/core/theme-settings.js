import { newObservableObject } from "./observable-object.js";

export const THEME_KEY = "fontra-theme";

export function themeSwitch(value) {
  const rootElement = document.querySelector("html");
  rootElement.classList.remove("light-theme");
  rootElement.classList.remove("dark-theme");
  if (value !== "automatic") {
    rootElement.classList.add(value + "-theme");
  }
}

const themeModel = newObservableObject({ theme: "automatic" });
themeModel.synchronizeWithLocalStorage("fontra-");

export function themeSwitchFromLocalStorage() {
  themeSwitch(themeModel.theme);

  themeModel.addEventListener("changed", (event) => {
    if (event.key === "theme") {
      themeSwitch(themeModel.theme);
      const event = new CustomEvent("fontra-theme-switch", {
        bubbles: false,
      });
      window.dispatchEvent(event);
    }
  });
}
