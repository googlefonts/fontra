export const THEME_KEY = "fontra-theme";


export function themeSwitch(value) {
  const rootElement = document.querySelector("html");
  rootElement.classList.remove("light-theme");
  rootElement.classList.remove("dark-theme");
  if (value !== "automatic") {
    rootElement.classList.add(value + "-theme");
  }
}


export function themeSwitchFromLocalStorage() {
  _themeSwitchFromLocalStorage();

  addEventListener("storage", event => {
    if (event.key === THEME_KEY) {
      _themeSwitchFromLocalStorage();
    }
  });

}


function _themeSwitchFromLocalStorage() {
  const themeValue = localStorage.getItem(THEME_KEY);
  if (themeValue) {
    themeSwitch(themeValue);
  }
}
