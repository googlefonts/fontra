export function themeColorCSS(colors) {
  const definitions = [];
  const lightMode = [];
  const darkMode = [];
  for (const [colorName, [lightColor, darkColor]] of Object.entries(colors)) {
    definitions.push(`--${colorName}-light: ${lightColor};`);
    definitions.push(`--${colorName}-dark: ${darkColor};`);
    lightMode.push(`--${colorName}: var(--${colorName}-light);`);
    darkMode.push(`--${colorName}: var(--${colorName}-dark);`);
  }
  return `
:host {
${indentLines(definitions, 2)}

${indentLines(lightMode, 2)}
}

:host-context(html.dark-theme) {
${indentLines(darkMode, 2)}
}

@media (prefers-color-scheme: dark) {
  :host {
${indentLines(darkMode, 4)}
  }

  :host-context(html.light-theme) {
${indentLines(lightMode, 4)}
  }
}
`;
}

function indentLines(lines, numSpaces) {
  lines = lines.map((line) => " ".repeat(numSpaces) + line);
  return lines.join("\n");
}
