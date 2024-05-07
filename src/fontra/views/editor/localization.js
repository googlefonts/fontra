const localization = {
  "en": {
    "action.redo": "Redo",
    "action.undo": "Undo",
    "action.deleteselection": "Delete Selection",
    "action.deleteglyph": "Delete Glyph",
    "action.selectnone": "Select None",
    "action.selectall": "Select All",
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
    "menubar.glyph.add": "Add source...",
    "menubar.glyph.delete": "Delete source...",
    "menubar.glyph.editaxes": "Edit Local Axes...",
    "menubar.extensions": "Extensions",
    "menubar.extensions.plugin": "Plugin Manager",
    "menubar.help": "Help",
    "menubar.help.homepage": "Homepage",
    "menubar.help.documentation": "Documentation",
    "menubar.help.github": "GitHub",
    "panel.settings.glyph": "Glyph editor appearance",
    "panel.settings.glyph.upmgrid": "Units-per-em grid",
    "panel.settings.clipboard": "Clipboard export format",
    "panel.settings.experimental": "Experimental features",
    "panel.settings.theme": "Theme settings",
    "panel.settings.theme.auto": "Automatic (use OS setting)",
    "panel.settings.theme.light": "Light",
    "panel.settings.theme.dark": "Dark",
    "panel.settings.server": "Server info",
    "selection.none": "(No selection)",
  },
  "zh-CN": {
    "action.redo": "重做",
    "action.undo": "撤销",
    "action.deleteselection": "删除选中",
    "action.deleteglyph": "删除字符形",
    "action.selectnone": "取消选择",
    "action.selectall": "全选",
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
    "menubar.glyph.add": "添加源……",
    "menubar.glyph.delete": "删除源……",
    "menubar.glyph.editaxes": "编辑局部参数轴……",
    "menubar.extensions": "扩展",
    "menubar.extensions.plugin": "插件管理器",
    "menubar.help": "帮助",
    "menubar.help.homepage": "主页",
    "menubar.help.documentation": "文档",
    "menubar.help.github": "GitHub",
    "panel.settings.glyph": "字符形编辑器外观",
    "panel.settings.glyph.upmgrid": "Units-per-em 网格",
    "panel.settings.clipboard": "剪贴板导出格式",
    "panel.settings.experimental": "实验性功能",
    "panel.settings.theme": "主题设置",
    "panel.settings.theme.auto": "自动（使用操作系统设置）",
    "panel.settings.theme.light": "亮色",
    "panel.settings.theme.dark": "暗色",
    "panel.settings.server": "服务器信息",
    "selection.none": "（未选择）",
  },
};

const debugTranslation = false;

export function translate(key) {
  if (debugTranslation) {
    return key;
  }

  const language = navigator.language;
  if (language in localization) {
    return localization[language][key];
  } else {
    console.log(
      `Current language: ${language} is not supported, falling back to "en".`
    );
    return localization["en"][key];
  }
}
