import * as html from "./html-utils.js";
import { translate } from "/core/localization.js";
import { MenuBar } from "/web-components/menu-bar.js";

const mapMenuItemKeyToFunction = {
  // File: getFileMenuItems, // TODO: this does not work, becuase viewController.fontController?.backendInfo is undefined. And I don't know why.
  Font: getFontMenuItems,
  Edit: getEditMenuItems,
  View: getViewMenuItems,
  Glyph: getGlyphMenuItems,
};

export function makeFontraMenuBar(menuItemKeys, viewController) {
  const menuBarArray = [getFontraMenu()]; // Fontra-Menu at the beginning.

  for (const itemKey of menuItemKeys) {
    const methodName = `get${itemKey}MenuItems`;
    let menuItems = [];
    if (typeof viewController[methodName] === "function") {
      menuItems = viewController[methodName]();
    } else if (mapMenuItemKeyToFunction[itemKey]) {
      menuItems = mapMenuItemKeyToFunction[itemKey](viewController);
    } else if (menuItems.length === 0) {
      console.log("Menu has not items, skip: ", itemKey);
      continue;
    } else {
      console.log("Method/Function does not exist, skip: ", itemKey, methodName);
      continue;
    }

    const menu = {
      title: translate(`menubar.${itemKey.toLowerCase()}`),
      getItems: () => {
        return menuItems;
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

// // Disable for now, as the font overview isn't yet minimally feature-complete
// {
//   title: translate("menubar.window"),
//   enabled: () => true,
//   getItems: () => {
//     return [
//       {
//         title: translate("font-overview.title"),
//         enabled: () => true,
//         callback: () => {
//           const url = new URL(window.location);
//           url.pathname = url.pathname.replace("/editor/", "/fontoverview/");
//           url.hash = ""; // remove any hash
//           window.open(url.toString());
//         },
//       },
//     ];
//   },
// },
