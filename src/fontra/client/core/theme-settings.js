import { newObservableObject } from "./observable-object.js";

function setupThemeOverride(value) {
  const rootElement = document.querySelector("html");
  rootElement.classList.remove("light-theme");
  rootElement.classList.remove("dark-theme");
  if (value !== "automatic") {
    rootElement.classList.add(value + "-theme");
  }
}

export const themeModelObject = newObservableObject({ theme: "automatic" });

themeModelObject.synchronizeWithLocalStorage("fontra-");

themeModelObject.addEventListener("changed", (event) => {
  if (event.key === "theme") {
    setupThemeOverride(themeModelObject.theme);
  }
});

setupThemeOverride(themeModelObject.theme);
