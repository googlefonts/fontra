import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from "@codemirror/commands";
import {
  bracketMatching,
  foldGutter,
  foldKeymap,
  HighlightStyle,
  indentOnInput,
  LanguageSupport,
  StreamLanguage,
  syntaxHighlighting,
} from "@codemirror/language";
import { simpleMode } from "@codemirror/legacy-modes/mode/simple-mode";
import { lintKeymap } from "@codemirror/lint";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";
import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { scheduleCalls } from "@fontra/core/utils.js";
import { Tag } from "@lezer/highlight";
import { BaseInfoPanel } from "./panel-base.js";

addStyleSheet(`
:root {
  --comment-color-light: var(--fontra-theme-marker) #676e78;
  --comment-color-dark: #a2a2a2;
  --keyword-color-light: var(--fontra-theme-marker) #0b57d0;
  --keyword-color-dark: #75bfff;
  --glyph-class-color-light: var(--fontra-theme-marker) #b90063;
  --glyph-class-color-dark: #ff7de9;
  --glyph-range-color-light: var(--fontra-theme-marker) #b95a00;
  --glyph-range-color-dark: #ffbe7d;
  --named-glyph-class-color-light: var(--fontra-theme-marker) #198639;
  --named-glyph-class-color-dark: #86de74;

  --comment-color: var(--comment-color-light, var(--comment-color-dark));
  --keyword-color: var(--keyword-color-light, var(--keyword-color-dark));
  --glyph-class-color: var(--glyph-class-color-light, var(--glyph-class-color-dark));
  --glyph-range-color: var(--glyph-range-color-light, var(--glyph-range-color-dark));
  --named-glyph-class-color: var(--named-glyph-class-color-light, var(--named-glyph-class-color-dark));
}

#opentype-feature-code-panel.font-info-panel {
  height: 100%;
}

.font-info-opentype-feature-code-container {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  overflow: hidden;
}

.font-info-opentype-feature-code-header {
  font-weight: bold;
  padding: 1em;
  padding-bottom: 0.5em;
}

#font-info-opentype-feature-code-text-entry-textarea {
  font-size: 1.1em;
  height: calc(100% - 2.4em);
}

#font-info-opentype-feature-code-text-entry-textarea > .cm-editor {
  height: 100%;
}

#font-info-opentype-feature-code-text-entry-textarea > .cm-scroller {
  overflow: auto;
}

#font-info-opentype-feature-code-text-entry-textarea > .cm-editor.cm-focused {
  outline: none;
}

`);

const openTypeFeatureCodeSimpleMode = simpleMode({
  start: [
    { regex: /#.*/, token: "comment" },
    {
      regex:
        /\b(?:anchor|anchorDef|anon|anonymous|by|contourpoint|cursive|device|enum|enumerate|exclude_dflt|feature|from|ignore|IgnoreBaseGlyphs|IgnoreLigatures|IgnoreMarks|include|include_dflt|language|languagesystem|lookup|lookupflag|mark|MarkAttachmentType|markClass|nameid|NULL|parameters|pos|position|required|reversesub|RightToLeft|rsub|script|sub|substitute|subtable|table|useExtension|useMarkFilteringSet|valueRecordDef|excludeDFLT|includeDFLT)\b/,
      token: "keyword",
    },
    {
      regex: /\[\s*\\?[a-zA-Z0-9_.]+(?:\s+\\?[a-zA-Z0-9_.]+)*\s*\]/,
      token: "glyphClass",
    },
    {
      regex: /\[\s*(\\?[a-zA-Z0-9_.]+)\s*-\s*(\\?[a-zA-Z0-9_.]+)\s*\]/,
      token: "glyphRange",
    },
    { regex: /@[a-zA-Z0-9_.]+/, token: "namedGlyphClass" },
  ],
  languageData: {
    commentTokens: { line: "#" },
    autocomplete: myCompletions,
  },
});

openTypeFeatureCodeSimpleMode.tokenTable = {
  comment: Tag.define(),
  keyword: Tag.define(),
  glyphClass: Tag.define(),
  glyphRange: Tag.define(),
  namedGlyphClass: Tag.define(),
};

const openTypeFeatureCodeStreamLanguage = StreamLanguage.define(
  openTypeFeatureCodeSimpleMode
);

const openTypeFeatureCodeHighlighter = syntaxHighlighting(
  HighlightStyle.define([
    {
      tag: openTypeFeatureCodeSimpleMode.tokenTable.comment,
      color: "var(--comment-color)",
    },
    {
      tag: openTypeFeatureCodeSimpleMode.tokenTable.keyword,
      color: "var(--keyword-color)",
    },
    {
      tag: openTypeFeatureCodeSimpleMode.tokenTable.glyphClass,
      color: "var(--glyph-class-color)",
    },
    {
      tag: openTypeFeatureCodeSimpleMode.tokenTable.glyphRange,
      color: "var(--glyph-range-color)",
    },
    {
      tag: openTypeFeatureCodeSimpleMode.tokenTable.namedGlyphClass,
      color: "var(--named-glyph-class-color)",
    },
  ])
);

const openTypeFeatureLanguage = new LanguageSupport(openTypeFeatureCodeStreamLanguage, [
  openTypeFeatureCodeHighlighter,
]);

const customTheme = EditorView.theme({
  ".cm-cursor": {
    borderLeft: "2px solid var(--fontra-red-color)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--ui-element-background-color)",
    color: "var(--horizontal-rule-color)",
    borderRight: "1px solid var(--horizontal-rule-color)",
  },
  ".cm-activeLine": {
    backgroundColor: "#8D8D8D10",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
    color: "var(--ui-element-foreground-color)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "#D3E3FD",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--background-color)",
    border: "0.5px solid gray",
    borderRadius: "4px",
    boxShadow: "2px 3px 10px #00000020",
    padding: "0.5em 0",
    fontFamily: "monospace",
    fontSize: "1.1em",
  },
  ".cm-tooltip-autocomplete": {
    "& > ul > li[aria-selected]": {
      backgroundColor: "var(--fontra-red-color)",
    },
  },
  ".cm-tooltip.cm-completionInfo": {
    fontSize: "1em",
    padding: "0.5em 0.8em 0.7em 0.8em",
  },
});

export class OpenTypeFeatureCodePanel extends BaseInfoPanel {
  static title = "opentype-feature-code.title";
  static id = "opentype-feature-code-panel";
  static fontAttributes = ["features"];

  async setupUI() {
    this.updateFeatureCode = scheduleCalls(
      (update) => this._updateFeatureCode(update),
      500
    );
    const features = await this.fontController.getFeatures();
    this.panelElement.innerHTML = "";
    const container = html.div(
      { class: "font-info-opentype-feature-code-container" },
      []
    );
    container.appendChild(
      html.div({ class: "font-info-opentype-feature-code-header" }, [
        "OpenType Feature Code", // TODO: translation
      ])
    );
    const editorContainer = html.div(
      { id: "font-info-opentype-feature-code-text-entry-textarea" },
      []
    );

    const customSetup = (() => [
      lineNumbers(),
      highlightActiveLineGutter(),
      highlightSpecialChars(),
      history(),
      foldGutter(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      indentOnInput(),
      bracketMatching(),
      closeBrackets(),
      autocompletion(),
      rectangularSelection(),
      crosshairCursor(),
      highlightActiveLine(),
      highlightSelectionMatches(),
      keymap.of([
        indentWithTab,
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...searchKeymap,
        ...historyKeymap,
        ...foldKeymap,
        ...completionKeymap,
        ...lintKeymap,
      ]),
    ])();

    this.editorView = new EditorView({
      doc: features.text,
      extensions: [
        openTypeFeatureLanguage,
        customSetup,
        customTheme,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.updateFeatureCode(update);
          }
        }),
      ],
      parent: editorContainer,
    });

    container.appendChild(editorContainer);
    this.panelElement.appendChild(container);
  }

  async _updateFeatureCode(update) {
    const undoLabel = "edit OpenType feature code"; // TODO: translation
    const changes = await this.fontController.performEdit(
      undoLabel,
      "features",
      (root) => {
        root.features.text = update.state.doc.toString();
      }
    );
  }

  getUndoRedoLabel(isRedo) {
    return isRedo ? "action.redo" : "action.undo";
  }

  canUndoRedo(isRedo) {
    return !!(isRedo
      ? redoDepth(this.editorView.state)
      : undoDepth(this.editorView.state));
  }

  async doUndoRedo(isRedo) {
    if (isRedo) {
      redo(this.editorView);
    } else {
      undo(this.editorView);
    }
  }
}

// For details, please see:
// https://codemirror.net/try/?example=Custom%20completions
const completions = [
  {
    label: "feature",
    type: "keyword",
    info: `Example:
    feature case {
      # lookups and rules
    } case;`,
    apply: `feature xxxx {
  # lookups and rules
} xxxx;`,
  },
  {
    label: "lookup",
    type: "keyword",
    info: `Example:
    lookup LookupName {
      # rules
    } LookupName;`,
    apply: `lookup LookupName {
  # rules
} LookupName`,
  },
  {
    label: "sub",
    type: "keyword",
    info: `Examples:
    sub A by A.ss01;
    sub [a b c] by [A.sc B.sc C.sc];
    sub @FIGURES_DFLT by @FIGURES_TLF ;`,
    detail: "substitution",
    // apply: `sub A by A.ss01;`,
  },
  {
    label: "pos",
    type: "keyword",
    info: `Example:
    pos @A V -100;`,
    detail: "position",
  },
  {
    label: "ignore",
    type: "keyword",
    info: `Example:
    ignore sub w o r' d s exclam;
    sub w o r' d s by r.alt;`,
  },
  {
    label: "script",
    type: "keyword",
    info: `Example:
    script latn;`,
  },
  {
    label: "language",
    type: "keyword",
    info: `Example:
    language TRK  exclude_dflt; # Turkish
    sub i by i.dot;`,
  },
  {
    label: "languagesystem",
    type: "keyword",
    info: `Example:
    languagesystem DFLT dflt;
    languagesystem latn AFK ;`,
  },
  // TODO: Extend with helpful completions
];

function myCompletions(context) {
  let before = context.matchBefore(/\w+/);
  if (!context.explicit && !before) return null;
  return {
    from: before ? before.from : context.pos,
    options: completions,
    validFor: /^\w*$/,
  };
}
