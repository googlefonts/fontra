import { UnlitElement } from "/core/unlit.js";
import * as html from "/core/unlit.js";
import { themeColorCSS } from "./theme-support.js";

const LIST_CHUNK_SIZE = 200; // the amount of items added to the list at a time

const colors = {
  "border-color": ["lightgray", "darkgray"],
  "row-border-color": ["#ddd", "#333"],
  "row-foreground-color": ["black", "white"],
  "row-background-color": ["white", "#333"],
  "row-selected-background-color": ["#ddd", "#555"],
};

export class UIList extends UnlitElement {
  static styles = `
    ${themeColorCSS(colors)}

    :host {
      overflow: scroll;
      border: solid 1px var(--border-color);
    }

    :host-context(.empty) {
      display: none;
    }

    .contents {
      display: flex;
      flex-direction: column;
    }

    .contents > .row {
      display: flex;
      width: content;
      border-top: solid 1px var(--row-border-color);
      color: var(--row-foreground-color);
      background-color: var(--row-background-color);
      padding: 0.15em;
      padding-left: 0.5em;
      padding-right: 0.5em;
      cursor: pointer;
      user-select: none;
    }

    .contents > .selected {
      background-color: var(--row-selected-background-color);
    }

    .contents > .row > .text-cell {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    `;

  constructor() {
    super();

    this.tabIndex = "1";

    this._columnDescriptions = [
      {
        key: "default",
        get: (item) => item,
      },
    ];
    this.items = [];
    this.itemEqualFunc = null;

    this.contents = html.div({
      class: "contents empty",
      onclick: (event) => this._clickHandler(event),
      ondblclick: (event) => this._dblClickHandler(event),
    });
    this.addEventListener("scroll", (event) => this._scrollHandler(event), false);
    this.addEventListener("keydown", (event) => this._keyDownHandler(event), false);
    this.addEventListener("keyup", (event) => this._keyUpHandler(event), false);
    this.selectedItemIndex = undefined;
    this.allowEmptySelection = true;
  }

  render() {
    return this.contents;
  }

  get columnDescriptions() {
    return this._columnDescriptions;
  }

  set columnDescriptions(columnDescriptions) {
    this._columnDescriptions = columnDescriptions;
    this.setItems(this.items);
  }

  setItems(items) {
    this.classList.toggle("empty", !items.length);
    this.contents.innerHTML = "";
    this.items = items;
    this._itemsBackLog = Array.from(items);
    this.selectedItemIndex = undefined;
    this._addMoreItemsIfNeeded();
  }

  getSelectedItem() {
    if (this.selectedItemIndex === undefined) {
      return undefined;
    }
    return this.items[this.selectedItemIndex];
  }

  setSelectedItem(item, shouldDispatchEvent = false) {
    let index = -1;
    if (item && this.itemEqualFunc) {
      const itemEqualFunc = this.itemEqualFunc;
      const items = this.items;
      for (let i = 0; i < items.length; i++) {
        if (itemEqualFunc(item, items[i])) {
          index = i;
          break;
        }
      }
    } else if (item) {
      index = this.items.indexOf(item);
    }
    if (index >= 0) {
      this.setSelectedItemIndex(index, shouldDispatchEvent);
    } else {
      this.setSelectedItemIndex(undefined, shouldDispatchEvent);
    }
  }

  _addMoreItemsIfNeeded() {
    while (
      this._itemsBackLog.length > 0 &&
      this.scrollTop + this.offsetHeight + 200 > this.contents.offsetHeight
    ) {
      this._addMoreItems();
      if (this.offsetHeight === 0) {
        break;
      }
    }
  }

  _addMoreItems() {
    const items = this._itemsBackLog.splice(0, LIST_CHUNK_SIZE);
    let rowIndex = this.contents.childElementCount;
    for (const item of items) {
      const row = document.createElement("div");
      row.className = "row";
      row.dataset.rowIndex = rowIndex;
      if (rowIndex === this.selectedItemIndex) {
        row.classList.add("selected");
      }

      for (const colDesc of this.columnDescriptions) {
        const cell = document.createElement("div");
        cell.className = "text-cell " + colDesc.key;
        if (colDesc.width) {
          cell.style.width = colDesc.width;
        }
        const value = colDesc.get ? colDesc.get(item) : item[colDesc.key];
        cell.append(value);
        row.appendChild(cell);
      }

      this.contents.appendChild(row);
      rowIndex++;
    }
  }

  _clickHandler(event) {
    const rowIndex = this._getRowIndexFromTarget(event.target);
    if (rowIndex !== undefined) {
      this.setSelectedItemIndex(this._getRowIndexFromTarget(event.target), true);
    }
  }

  _dblClickHandler(event) {
    this.doubleClickedRowIndex = this._getRowIndexFromTarget(event.target);
    this._dispatchEvent("rowDoubleClicked");
  }

  _getRowIndexFromTarget(target) {
    if (target.parentNode === this.contents) {
      // clicked on row
      return target.dataset.rowIndex;
    } else if (target.parentNode.parentNode === this.contents) {
      // clicked on cell
      return target.parentNode.dataset.rowIndex;
    }
  }

  setSelectedItemIndex(rowIndex, shouldDispatchEvent = false) {
    if (rowIndex === undefined && !this.allowEmptySelection) {
      return;
    }
    if (!isNaN(rowIndex)) {
      rowIndex = Number(rowIndex);
    }
    if (rowIndex === this.selectedItemIndex) {
      // nothing to do
      return;
    }
    if (this.selectedItemIndex !== undefined) {
      const row = this.contents.children[this.selectedItemIndex];
      row?.classList.remove("selected");
    }
    if (rowIndex !== undefined) {
      const row = this.contents.children[rowIndex];
      row?.classList.add("selected");
    }
    this.selectedItemIndex = rowIndex;
    if (!this._isKeyRepeating && shouldDispatchEvent) {
      this._dispatchEvent("listSelectionChanged");
    }
  }

  getSelectedItemIndex() {
    return this.selectedItemIndex;
  }

  _dispatchEvent(eventName) {
    const event = new CustomEvent(eventName, {
      bubbles: false,
      detail: this,
    });
    this.dispatchEvent(event);
  }

  _keyDownHandler(event) {
    if (event.key === "Enter" && this.selectedItemIndex !== undefined) {
      this.doubleClickedRowIndex = this.selectedItemIndex;
      this._dispatchEvent("rowDoubleClicked");
      return;
    }
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    if (!this.items.length) {
      return;
    }
    let rowIndex = this.selectedItemIndex;
    if (rowIndex === undefined) {
      rowIndex = 0;
    } else {
      rowIndex = event.key === "ArrowUp" ? rowIndex - 1 : rowIndex + 1;
      rowIndex = Math.min(Math.max(rowIndex, 0), this.items.length - 1);
    }
    this._isKeyRepeating = event.repeat;
    this.setSelectedItemIndex(rowIndex, true);
    const newRow = this.contents.children[rowIndex];
    newRow?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "nearest" });
  }

  _keyUpHandler(event) {
    if (this._isKeyRepeating) {
      // When key events repeat, they may fire too fast, so selection-changed
      // events are suppressed. We need to send one after the fact.
      this._isKeyRepeating = false;
      this._dispatchEvent("listSelectionChanged");
    }
  }

  _scrollHandler(event) {
    this._addMoreItemsIfNeeded();
  }
}

customElements.define("ui-list", UIList);
