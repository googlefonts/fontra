import { autocompletion } from "@codemirror/autocomplete";
import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { scheduleCalls } from "@fontra/core/utils.js";
import { basicSetup, EditorView } from "codemirror";
import { BaseInfoPanel } from "./panel-base.js";

addStyleSheet(`

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
  overflow: scroll;
  height: calc(100% - 2em);
}

#font-info-opentype-feature-code-text-entry-textarea > .cm-editor {
  height: 100%;
}

`);

const customTheme = EditorView.theme({
  ".cm-cursor": {
    borderLeft: "2px solid var(--fontra-red-color)",
  },
  ".cm-gutters": {
    backgroundColor: "var(--ui-element-background-color)",
    color: "var(--horizontal-rule-color)",
    borderRight: "1px solid var(--horizontal-rule-color)",
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

    const view = new EditorView({
      doc: features.text,
      extensions: [
        basicSetup,
        customTheme,
        autocompletion({ override: [myCompletions] }),
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
    this.pushUndoItem(changes, undoLabel);
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
