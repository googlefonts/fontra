import * as html from "./html-utils.js";
import { translate } from "/core/localization.js";
import { MenuBar } from "/web-components/menu-bar.js";

const mapMenuItemKeyToFunction = {
  File: getFileMenuItems,
  Font: getFontMenuItems,
  // "Edit": getEditMenuItems,
  // "View": getViewMenuItems,
  // "Glyph": getGlyphMenuItems,
};

export function makeFontraMenuBar(menuItemKeys, delegate) {
  const menuBarArray = [getFontraMenuItems()]; // Fontra-Menu at the beginning.

  for (const itemKey of menuItemKeys) {
    const methodName = `get${itemKey}MenuItems`;
    if (typeof delegate[methodName] === "function") {
      menuBarArray.push(delegate[methodName]());
    } else if (mapMenuItemKeyToFunction[itemKey]) {
      menuBarArray.push(mapMenuItemKeyToFunction[itemKey](delegate));
    } else {
      console.log("Method/Function does not exist, skip: ", itemKey, methodName);
    }
  }

  menuBarArray.push(getHelpMenuItems()); // Help-Menu at the end.
  const menuBar = new MenuBar(menuBarArray);
  return menuBar;
}

function getFontraMenuItems() {
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

function getHelpMenuItems() {
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

function getFileMenuItems(delegate) {
  return {
    title: translate("menubar.file"),
    getItems: () => {
      let exportFormats =
        delegate.fontController?.backendInfo.projectManagerFeatures["export-as"] || [];
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
    },
  };
}

// TODO: Is a default possible, or do we skip it if not provided by the 'View'?
// function getEditMenuItems() {
//   return {
//     title: translate("menubar.edit"),
//     getItems: () => {
//       const menuItems = [...this.basicContextMenuItems];
//       if (this.sceneSettings.selectedGlyph?.isEditing) {
//         this.sceneController.updateContextMenuState(event);
//         menuItems.push(MenuItemDivider);
//         menuItems.push(...this.glyphEditContextMenuItems);
//       }
//       return menuItems;
//     },
//   };
// }

// TODO: Is a default possible, or do we skip it if not provided by the 'View'?
// function getViewMenuItems() {
//   return {
//     title: translate("menubar.view"),
//     getItems: () => {
//       const items = [
//         {
//           actionIdentifier: "action.zoom-in",
//         },
//         {
//           actionIdentifier: "action.zoom-out",
//         },
//       ];
//       return items;
//     },
//   };
// }

function getFontMenuItems() {
  return {
    title: translate("menubar.font"),
    enabled: () => true,
    getItems: () => {
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
    },
  };
}

// TODO: Is a default possible, or do we skip it if not provided by the 'View'?
// function getGlyphMenuItems() {
//   return {
//     title: translate("menubar.glyph"),
//     enabled: () => true,
//     getItems: () => [
//       // TODO: Is a default possible, or do we skip it if not provided by the 'View'?
//     ],
//   };
// }

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
