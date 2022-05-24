export function themeSwitch(value) {
  const rootElement = document.querySelector("html");
  rootElement.classList.remove("light-theme");
  rootElement.classList.remove("dark-theme");
  if (value !== "automatic") {
    rootElement.classList.add(value + "-theme");
  }
}
