import Panel from "./panel.js";
import { recordChanges } from "/core/change-recorder.js";
import * as html from "/core/html-utils.js";
import { rectFromPoints, rectSize, unionRect } from "/core/rectangle.js";
import {
  getCharFromUnicode,
  makeUPlusStringFromCodePoint,
  parseSelection,
  round,
  splitGlyphNameExtension,
  throttleCalls,
} from "/core/utils.js";
import { Form } from "/web-components/ui-form.js";

export default class SelectionInfoPanel extends Panel {
  identifier = "selection-info";
  iconPath = "/images/info.svg";

  static styles = `
    .selection-info {
      display: flex;
      flex-direction: column;
      gap: 1em;
      justify-content: space-between;
      box-sizing: border-box;
      height: 100%;
      width: 100%;
      padding: 1em;
      white-space: normal;
    }

    ui-form {
      overflow-x: hidden;
      overflow-y: auto;
    }
  `;

  constructor(editorController) {
    super(editorController);
    this.infoForm = new Form();
    this.contentElement.appendChild(this.infoForm);
    this.contentElement.appendChild(this.setupBehaviorCheckBox());
    this.throttledUpdate = throttleCalls((senderID) => this.update(senderID), 100);
    this.fontController = this.editorController.fontController;
    this.sceneController = this.editorController.sceneController;

    this.sceneController.sceneSettingsController.addKeyListener(
      ["selectedGlyphName", "selection", "location"],
      (event) => this.throttledUpdate()
    );

    this.sceneController.sceneSettingsController.addKeyListener(
      "positionedLines",
      (event) => {
        if (!this.haveInstance) {
          this.update(event.senderInfo?.senderID);
        }
      }
    );

    this.sceneController.addCurrentGlyphChangeListener((event) => {
      this.throttledUpdate(event.senderID);
    });

    this.sceneController.addEventListener("glyphEditLocationNotAtSource", async () => {
      this.update();
    });
  }

  getContentElement() {
    return html.div(
      {
        class: "selection-info",
      },
      []
    );
  }

  async toggle(on, focus) {
    if (on) {
      this.update();
    }
  }

  setupBehaviorCheckBox() {
    const storageKey = "fontra.selection-info.absolute-value-changes";
    this.multiEditChangesAreAbsolute = localStorage.getItem(storageKey) === "true";
    return html.div({ class: "behavior-field" }, [
      html.input({
        type: "checkbox",
        id: "behavior-checkbox",
        checked: this.multiEditChangesAreAbsolute,
        onchange: (event) => {
          this.multiEditChangesAreAbsolute = event.target.checked;
          localStorage.setItem(storageKey, event.target.checked);
        },
      }),
      html.label(
        { for: "behavior-checkbox" },
        "Multi-source value changes are absolute"
      ),
    ]);
  }

  async update(senderInfo) {
    if (
      senderInfo?.senderID === this &&
      senderInfo?.fieldKeyPath?.length !== 3 &&
      senderInfo?.fieldKeyPath?.[0] !== "component" &&
      senderInfo?.fieldKeyPath?.[2] !== "name"
    ) {
      // Don't rebuild, just update the Dimensions field
      await this.updateDimensions();
      return;
    }
    if (!this.infoForm.contentElement.offsetParent) {
      // If the info form is not visible, do nothing
      return;
    }

    await this.fontController.ensureInitialized;

    const glyphName = this.sceneController.sceneSettings.selectedGlyphName;
    const glyphController = await this.sceneController.sceneModel.getGlyphInstance(
      glyphName,
      this.sceneController.sceneSettings.editLayerName
    );
    let unicodes = this.fontController.glyphMap?.[glyphName] || [];

    const instance = glyphController?.instance;
    this.haveInstance = !!instance;

    const selectedGlyphInfo = this.sceneController.sceneModel.getSelectedGlyphInfo();

    if (
      selectedGlyphInfo?.isUndefined &&
      selectedGlyphInfo.character &&
      !unicodes.length
    ) {
      // Glyph does not yet exist in the font, but we can grab the unicode from
      // selectedGlyphInfo.character anyway
      unicodes = [selectedGlyphInfo.character.codePointAt(0)];
    }

    const unicodesStr = makeUnicodesString(unicodes);
    let baseUnicodesStr;
    if (glyphName && !unicodes.length) {
      const [baseGlyphName, _] = splitGlyphNameExtension(glyphName);
      baseUnicodesStr = makeUnicodesString(
        this.fontController.glyphMap?.[baseGlyphName]
      );
    }

    const formContents = [];
    if (glyphName) {
      formContents.push({
        key: "glyphName",
        type: "text",
        label: "Glyph name",
        value: glyphName,
      });
      formContents.push({
        key: "unicodes",
        type: "text",
        label: "Unicode",
        value: unicodesStr,
      });
      if (baseUnicodesStr) {
        formContents.push({
          key: "baseUnicodes",
          type: "text",
          label: "Base unicode",
          value: baseUnicodesStr,
        });
      }
      if (instance) {
        formContents.push({
          type: "edit-number",
          key: '["xAdvance"]',
          label: "Advance width",
          value: instance.xAdvance,
          minValue: 0,
        });
      }
    }

    const { pointIndices, componentIndices } = this._getSelection();

    if (glyphController) {
      formContents.push(
        ...this._setupDimensionsInfo(glyphController, pointIndices, componentIndices),
        ...this._setupInterpolationErrorInfo(glyphController)
      );
    }

    for (const index of componentIndices) {
      if (!instance) {
        break;
      }
      const component = instance.components[index];
      if (!component) {
        // Invalid selection
        continue;
      }
      const componentKey = (...path) => JSON.stringify(["components", index, ...path]);

      formContents.push({ type: "divider" });
      formContents.push({ type: "header", label: `Component #${index}` });
      formContents.push({
        type: "edit-text",
        key: componentKey("name"),
        label: "Base glyph",
        value: component.name,
      });
      formContents.push({ type: "header", label: "Transformation" });

      for (const key of [
        "translateX",
        "translateY",
        "rotation",
        "scaleX",
        "scaleY",
        "skewX",
        "skewY",
        "tCenterX",
        "tCenterY",
      ]) {
        const value = component.transformation[key];
        formContents.push({
          type: "edit-number",
          key: componentKey("transformation", key),
          label: key,
          value: value,
        });
      }
      const baseGlyph = await this.fontController.getGlyph(component.name);
      if (baseGlyph && component.location) {
        const locationItems = [];
        const axes = Object.fromEntries(
          baseGlyph.axes.map((axis) => [axis.name, axis])
        );
        // Add global axes, if in location and not in baseGlyph.axes
        // TODO: this needs more thinking, as the axes of *nested* components
        // may also be of interest. Also: we need to be able to *add* such a value
        // to component.location.
        for (const axis of this.fontController.globalAxes) {
          if (axis.name in component.location && !(axis.name in axes)) {
            axes[axis.name] = axis;
          }
        }
        const axisList = Object.values(axes);
        // Sort axes: lowercase first, uppercase last
        axisList.sort((a, b) => {
          const firstCharAIsUpper = a.name[0] === a.name[0].toUpperCase();
          const firstCharBIsUpper = b.name[0] === b.name[0].toUpperCase();
          if (firstCharAIsUpper != firstCharBIsUpper) {
            return firstCharBIsUpper ? -1 : 1;
          } else {
            return a.name < b.name ? -1 : +1;
          }
        });
        for (const axis of axisList) {
          let value = component.location[axis.name];
          if (value === undefined) {
            value = axis.defaultValue;
          }
          locationItems.push({
            type: "edit-number-slider",
            key: componentKey("location", axis.name),
            label: axis.name,
            value: value,
            minValue: axis.minValue,
            defaultValue: axis.defaultValue,
            maxValue: axis.maxValue,
          });
        }
        if (locationItems.length) {
          formContents.push({ type: "header", label: "Location" });
          formContents.push(...locationItems);
        }
      }
    }

    this._formFieldsByKey = Object.fromEntries(
      formContents.map((field) => [field.key, field])
    );

    if (!formContents.length) {
      this.infoForm.setFieldDescriptions([{ type: "text", value: "(No selection)" }]);
    } else {
      this.infoForm.setFieldDescriptions(formContents);
      await this._setupSelectionInfoHandlers(glyphName);
    }
  }

  _setupDimensionsInfo(glyphController, pointIndices, componentIndices) {
    const dimensionsString = this._getDimensionsString(
      glyphController,
      pointIndices,
      componentIndices
    );
    const formContents = [];
    if (dimensionsString) {
      formContents.push({ type: "divider" });
      formContents.push({
        key: "dimensions",
        type: "text",
        label: "Dimensions",
        value: dimensionsString,
      });
    }
    return formContents;
  }

  _setupInterpolationErrorInfo(glyphController) {
    const formContents = [];
    if (glyphController.errors?.length) {
      formContents.push({ type: "divider" });
      const errorStrings = [];
      for (const error of glyphController.errors) {
        const iconChar = error.type === "warning" ? "⚠️" : "🔴";
        const nestedGlyphs =
          error.glyphs.length > 1
            ? error.glyphs
                .slice(1)
                .map((gn) => "→ " + gn)
                .join(" ")
            : "";
        errorStrings.push(`${iconChar} ${error.message} ${nestedGlyphs}`);
      }
      formContents.push({
        key: "interpolation-error",
        type: "text",
        label: "Interpolation",
        value: errorStrings.join("\n"),
      });
    }
    return formContents;
  }

  async updateDimensions() {
    const glyphController =
      await this.sceneController.sceneModel.getSelectedStaticGlyphController();
    const { pointIndices, componentIndices } = this._getSelection();
    const dimensionsString = this._getDimensionsString(
      glyphController,
      pointIndices,
      componentIndices
    );
    this.infoForm.setValue("dimensions", dimensionsString);
  }

  _getSelection() {
    const { point, component, componentOrigin, componentTCenter } = parseSelection(
      this.sceneController.selection
    );

    const componentIndices = [
      ...new Set([
        ...(component || []),
        ...(componentOrigin || []),
        ...(componentTCenter || []),
      ]),
    ].sort((a, b) => a - b);
    return { pointIndices: point || [], componentIndices };
  }

  _getDimensionsString(glyphController, pointIndices, componentIndices) {
    const selectionRects = [];
    if (pointIndices.length) {
      const instance = glyphController.instance;
      const selRect = rectFromPoints(
        pointIndices.map((i) => instance.path.getPoint(i)).filter((point) => !!point)
      );
      if (selRect) {
        selectionRects.push(selRect);
      }
    }
    for (const componentIndex of componentIndices) {
      const component = glyphController.components[componentIndex];
      if (!component || !component.controlBounds) {
        continue;
      }
      selectionRects.push(component.bounds);
    }
    if (!selectionRects.length && glyphController?.controlBounds) {
      selectionRects.push(glyphController.bounds);
    }
    if (selectionRects.length) {
      const selectionBounds = unionRect(...selectionRects);
      let { width, height } = rectSize(selectionBounds);
      width = round(width, 1);
      height = round(height, 1);
      return `↔ ${width} ↕ ${height}`;
    }
  }

  async _setupSelectionInfoHandlers(glyphName) {
    this.infoForm.onFieldChange = async (fieldKey, value, valueStream) => {
      const changePath = JSON.parse(fieldKey);
      const senderInfo = { senderID: this, fieldKeyPath: changePath };
      await this.sceneController.editGlyph(async (sendIncrementalChange, glyph) => {
        const layerInfo = Object.entries(
          this.sceneController.getEditingLayerFromGlyphLayers(glyph.layers)
        ).map(([layerName, layerGlyph]) => {
          return {
            layerName,
            layerGlyph,
            orgValue: getNestedValue(layerGlyph, changePath),
          };
        });

        let changes;

        if (valueStream) {
          // Continuous changes (eg. slider drag)
          for await (const value of valueStream) {
            for (const { layerName, layerGlyph, orgValue } of layerInfo) {
              if (orgValue !== undefined) {
                setNestedValue(layerGlyph, changePath, orgValue); // Ensure getting the correct undo change
              } else {
                deleteNestedValue(layerGlyph, changePath);
              }
            }
            changes = applyNewValue(
              glyph,
              layerInfo,
              changePath,
              value,
              this._formFieldsByKey[fieldKey],
              this.multiEditChangesAreAbsolute
            );
            await sendIncrementalChange(changes.change, true); // true: "may drop"
          }
        } else {
          // Simple, atomic change
          changes = applyNewValue(
            glyph,
            layerInfo,
            changePath,
            value,
            this._formFieldsByKey[fieldKey],
            this.multiEditChangesAreAbsolute
          );
        }

        const undoLabel =
          changePath.length == 1
            ? `${changePath.at(-1)}`
            : `${changePath.at(-2)}.${changePath.at(-1)}`;
        return {
          changes: changes,
          undoLabel: undoLabel,
          broadcast: true,
        };
      }, senderInfo);
    };
  }
}

function getNestedValue(subject, path) {
  for (const pathElement of path) {
    if (subject === undefined) {
      throw new Error(`assert -- invalid change path: ${path}`);
    }
    subject = subject[pathElement];
  }
  return subject;
}

function setNestedValue(subject, path, value) {
  const key = path.slice(-1)[0];
  path = path.slice(0, -1);
  subject = getNestedValue(subject, path);
  subject[key] = value;
}

function deleteNestedValue(subject, path) {
  const key = path.slice(-1)[0];
  path = path.slice(0, -1);
  subject = getNestedValue(subject, path);
  delete subject[key];
}

function applyNewValue(glyph, layerInfo, changePath, value, field, absolute) {
  const primaryOrgValue = layerInfo[0].orgValue;
  const isNumber = typeof primaryOrgValue === "number";
  const delta = isNumber && !absolute ? value - primaryOrgValue : null;
  return recordChanges(glyph, (glyph) => {
    const layers = glyph.layers;
    for (const { layerName, orgValue } of layerInfo) {
      let newValue = delta === null ? value : orgValue + delta;
      if (isNumber) {
        newValue = maybeClampValue(newValue, field.minValue, field.maxValue);
      }
      setNestedValue(layers[layerName].glyph, changePath, newValue);
    }
  });
}

function maybeClampValue(value, min, max) {
  if (min !== undefined) {
    value = Math.max(value, min);
  }
  if (max !== undefined) {
    value = Math.min(value, max);
  }
  return value;
}

function makeUnicodesString(unicodes) {
  return (unicodes || [])
    .map(
      (code) =>
        `${makeUPlusStringFromCodePoint(code)}\u00A0(${getCharFromUnicode(code)})`
    )
    .join(" ");
}

customElements.define("panel-selection-info", SelectionInfoPanel);
