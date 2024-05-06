const localization = {
  "en": {
    "menubar.file": "File",
    "menubar.file.new": "New...",
    "menubar.file.open": "Open...",
    "menubar.edit": "Edit",
    "menubar.view": "View",
    "menubar.view.zoomin": "Zoom In",
    "menubar.view.zoomout": "Zoom Out",
    "menubar.view.zoomtofit": "Zoom To Fit",
    "menubar.font": "Font",
    "menubar.font.edit": "Edit Font Info, Axes and Sources",
    "menubar.glyph": "glyph",
    "menubar.extensions": "Extensions",
    "menubar.help": "Help",
    "menubar.help.homepage": "Homepage",
    "menubar.help.documentation": "Documentation",
    "menubar.help.github": "GitHub",
  },
  "zh-CN": {
    "menubar.file": "文件",
    "menubar.file.new": "新建……",
    "menubar.file.open": "打开……",
    "menubar.edit": "编辑",
    "menubar.view": "视图",
    "menubar.view.zoomin": "放大",
    "menubar.view.zoomout": "缩小",
    "menubar.view.zoomtofit": "缩放到合适大小",
    "menubar.font": "字体",
    "menubar.font.edit": "编辑字体信息、参数轴和源",
    "menubar.glyph": "字符形",
    "menubar.extensions": "扩展",
    "menubar.help": "帮助",
    "menubar.help.homepage": "主页",
    "menubar.help.documentation": "文档",
    "menubar.help.github": "GitHub",
  },
};

const currentLanguage = "zh-CN";
const useBrowserLanguage = true;

export function translate(key) {
  if (useBrowserLanguage) {
    const language = navigator.language;
    if (language in localization) {
      return localization[language][key];
    }
  } else if (currentLanguage in localization) {
    return localization[currentLanguage][key];
  } else {
    console.log(`Unsupported language: ${language}`);
  }
  
}

