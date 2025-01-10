import { registerActionInfo } from "./actions.js";
import * as html from "./html-utils.js";
import { translate } from "./localization.js";
import { MenuBar } from "/web-components/menu-bar.js";

const mapMenuItemKeyToFunction = {
  File: getFileMenuItems,
  Font: getFontMenuItems,
  Edit: getEditMenuItems,
  View: getViewMenuItems,
  Glyph: getGlyphMenuItems,
  Window: getWindowMenuItems,
};

export function makeFontraMenuBar(menuItemKeys, viewController) {
  const menuBarArray = [getFontraMenu()]; // Fontra-Menu at the beginning.

  for (const itemKey of menuItemKeys) {
    const methodName = `get${itemKey}MenuItems`;
    const menu = {
      title: translate(`menubar.${itemKey.toLowerCase()}`),
      getItems: () => {
        return viewController[methodName]
          ? viewController[methodName]()
          : mapMenuItemKeyToFunction[itemKey](viewController);
      },
    };
    menuBarArray.push(menu);
  }

  menuBarArray.push(getHelpMenu()); // Help-Menu at the end.
  const menuBar = new MenuBar(menuBarArray);
  return menuBar;
}

function getFontraMenu() {
  return {
    title: "Fontra",
    bold: true,
    getItems: () => {
      const menuItems = [
        "shortcuts",
        "theme-settings",
        "display-language",
        "clipboard",
        "editor-behavior",
        "plugins-manager",
        "server-info",
      ];
      return menuItems.map((panelID) => ({
        title: translate(`application-settings.${panelID}.title`),
        enabled: () => true,
        callback: () => {
          window.open(`/applicationsettings/applicationsettings.html#${panelID}-panel`);
        },
      }));
    },
  };
}

function getHelpMenu() {
  return {
    title: translate("menubar.help"),
    getItems: () => {
      return [
        {
          title: translate("menubar.help.homepage"),
          enabled: () => true,
          callback: () => {
            window.open("https://fontra.xyz/");
          },
        },
        {
          title: translate("menubar.help.documentation"),
          enabled: () => true,
          callback: () => {
            window.open("https://docs.fontra.xyz");
          },
        },
        {
          title: translate("menubar.help.changelog"),
          enabled: () => true,
          callback: () => {
            window.open("https://fontra.xyz/changelog.html");
          },
        },
        {
          title: "GitHub",
          enabled: () => true,
          callback: () => {
            window.open("https://github.com/googlefonts/fontra");
          },
        },
      ];
    },
  };
}

function getFileMenuItems(viewController) {
  let exportFormats =
    viewController.fontController?.backendInfo.projectManagerFeatures["export-as"] ||
    [];
  if (exportFormats.length > 0) {
    return [
      {
        title: translate("menubar.file.export-as"),
        getItems: () =>
          exportFormats.map((format) => ({
            actionIdentifier: `action.export-as.${format}`,
          })),
      },
    ];
  } else {
    return [
      {
        title: translate("menubar.file.new"),
        enabled: () => false,
        callback: () => {},
      },
      {
        title: translate("menubar.file.open"),
        enabled: () => false,
        callback: () => {},
      },
    ];
  }
}

function getEditMenuItems() {
  return [{ actionIdentifier: "action.undo" }, { actionIdentifier: "action.redo" }];
}

function getViewMenuItems() {
  return [
    { actionIdentifier: "action.zoom-in" },
    { actionIdentifier: "action.zoom-out" },
  ];
}

function getFontMenuItems() {
  const menuItems = [
    [translate("font-info.title"), "#font-info-panel", true],
    [translate("axes.title"), "#axes-panel", true],
    [translate("cross-axis-mapping.title"), "#cross-axis-mapping-panel", true],
    [translate("sources.title"), "#sources-panel", true],
    [
      translate("development-status-definitions.title"),
      "#development-status-definitions-panel",
      true,
    ],
  ];
  return menuItems.map(([title, panelID, enabled]) => ({
    title,
    enabled: () => enabled,
    callback: () => {
      const url = new URL(window.location);
      url.pathname = `/fontinfo/-/${url.pathname.split("/").slice(-1)[0]}`;
      url.hash = panelID;
      window.open(url.toString());
    },
  }));
}

function getGlyphMenuItems() {
  return [];
}

function getWindowMenuItems() {
  return [
    {
      title: translate("font-overview.title"),
      enabled: () => true,
      callback: () => {
        const url = new URL(window.location);
        url.pathname = `/fontoverview/-/${url.pathname.split("/").slice(-1)[0]}`;
        url.hash = ""; // remove any hash
        window.open(url.toString());
      },
    },
    {
      title: translate("editor.title"),
      enabled: () => true,
      callback: () => {
        const url = new URL(window.location);
        url.pathname = `/editor/-/${url.pathname.split("/").slice(-1)[0]}`;
        url.hash = ""; // remove any hash
        window.open(url.toString());
      },
    },
  ];
}

// Default action infos

{
  const topic = "0030-action-topics.menu.edit";

  registerActionInfo("action.undo", {
    topic,
    sortIndex: 0,
    defaultShortCuts: [{ baseKey: "z", commandKey: true, shiftKey: false }],
  });

  registerActionInfo("action.redo", {
    topic,
    defaultShortCuts: [{ baseKey: "z", commandKey: true, shiftKey: true }],
  });

  registerActionInfo("action.cut", {
    topic,
    defaultShortCuts: [{ baseKey: "x", commandKey: true }],
  });

  registerActionInfo("action.copy", {
    topic,
    defaultShortCuts: [{ baseKey: "c", commandKey: true }],
  });

  registerActionInfo("action.paste", {
    topic,
    defaultShortCuts: [{ baseKey: "v", commandKey: true }],
  });

  registerActionInfo("action.delete", {
    topic,
    defaultShortCuts: [
      { baseKey: "Delete" },
      { baseKey: "Delete", altKey: true },
      { baseKey: "Backspace" },
      { baseKey: "Backspace", altKey: true },
    ],
  });

  registerActionInfo("action.select-all", {
    topic,
    defaultShortCuts: [{ baseKey: "a", commandKey: true }],
  });

  registerActionInfo("action.select-none", {
    topic,
    defaultShortCuts: [{ baseKey: "a", commandKey: true, shiftKey: true }],
  });
}
