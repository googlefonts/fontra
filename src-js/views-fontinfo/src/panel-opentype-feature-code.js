import { autocompletion } from "@codemirror/autocomplete";
import { StreamLanguage } from "@codemirror/language";
import { recordChanges } from "@fontra/core/change-recorder.js";
import * as html from "@fontra/core/html-utils.js";
import { addStyleSheet } from "@fontra/core/html-utils.js";
import { basicSetup, EditorView } from "codemirror";
import { BaseInfoPanel } from "./panel-base.js";

addStyleSheet(`
.font-info-opentype-feature-code-container {
  background-color: var(--ui-element-background-color);
  border-radius: 0.5em;
  padding: 1em;
}

.font-info-opentype-feature-code-header {
  font-weight: bold;
  padding-bottom: 1em;
}

#font-info-opentype-feature-code-text-entry-textarea {
  font-size: 1.1em;
}

`);

export class OpenTypeFeatureCodePanel extends BaseInfoPanel {
  static title = "opentype-feature-code.title";
  static id = "opentype-feature-code-panel";
  static fontAttributes = ["features"];

  async setupUI() {
    const features = await this.fontController.features;
    this.panelElement.innerHTML = "";
    console.log("features: ", features);
    const container = html.div(
      { class: "font-info-opentype-feature-code-container" },
      []
    );
    container.appendChild(
      html.div({ class: "font-info-opentype-feature-code-header" }, [
        "OpenType Feature Code",
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
        OpenTypeFeatureLanguage,
        autocompletion({ override: [myCompletions] }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const featureCodeText = update.state.doc.toString();
            console.log("Changed text: ", featureCodeText);
            this.editOpenTypeFeatureCode((root) => {
              root.features.text = featureCodeText;
            }, `edit OpenType feature code`); // TODO: translation
          }
        }),
      ],
      parent: editorContainer,
    });

    container.appendChild(editorContainer);
    this.panelElement.appendChild(container);
  }

  async editOpenTypeFeatureCode(editFunc, undoLabel) {
    const root = {
      features: await this.fontController.features,
    };
    const changes = recordChanges(root, (root) => {
      editFunc(root);
    });
    if (changes.hasChange) {
      await this.postChange(changes.change, changes.rollbackChange, undoLabel);
    }
  }
}

// The following code related to 'completions' is modified but based on:
// https://codemirror.net/try/?example=Custom%20completions
const completions = [
  {
    label: "feature",
    type: "keyword",
    info: "Features are identified with a four character tag",
  },
  {
    label: "lookup",
    type: "keyword",
    info: "Lookups are defined in a similar way to features.",
  },
  { label: "sub", type: "keyword", info: "Substitutions" },
  { label: "pos", type: "keyword", info: "The syntax for a positioning" },
  { label: "ignore", type: "keyword", info: "Ignore" },

  { label: "language", type: "keyword", info: "Language Systems" },
  { label: "languagesystem", type: "keyword", info: "Language" },
  { label: "script", type: "keyword", info: "Script " },
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

// NOTE: This is a very brief first try of language-specific color coding for OpenType feature code.
// The following code has been generated with the help of AI + hand modified a bit.
const OpenTypeFeatureLanguage = StreamLanguage.define({
  token(stream) {
    if (stream.match(/^#.*$/)) {
      stream.skipToEnd(); // Skip the entire line
      return null; // Do not apply any token
    }

    if (
      stream.match(/languagesystem |feature |class |lookup |script |language |sub |by /)
    )
      return "keyword";

    // if (stream.match(/[a-zA-Z0-9]/)) return "number"; // this is class
    if (stream.match(/@.*? /)) return "number"; // this is a class variable
    if (stream.match(/{|}/)) return "brace";
    if (stream.match(/\[|\]/)) return "squareBracket";
    if (stream.match(/\(|\)/)) return "paren";
    // if (stream.match(/'.*?'/)) return "string";
    // if (stream.match(/\b[a-zA-Z0-9_]+\b/)) return "number";
    // if (stream.match(/\b\d+\b/)) return "number";
    // if (stream.match(/\/\/.*$/)) return "comment";
    // if (stream.match(/ .*? /)) return "string";
    stream.next();
    return null;
  },
});
