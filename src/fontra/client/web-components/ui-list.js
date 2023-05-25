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
      display: grid;  /* also set by code below */
      grid-template-rows: auto 1fr;
      gap: 0.2em;
      min-height: 0;
      min-width: 0;
      box-sizing: border-box;
      overflow: hidden;
    }

    .container {
      overflow: scroll;
      height: 100%;
      width: 100%;
      box-sizing: border-box;
      border: solid 1px var(--border-color);
    }

    .contents {
      display: flex;
      flex-direction: column;
      outline: none;
    }

    .header-container::-webkit-scrollbar {
      display: none;
    }

    .header-container {
      overflow: scroll;
      height: 100%;
      width: 100%;
      box-sizing: border-box;
      scrollbar-width: none;  /* hide scrollbar in FireFox */
    }

    .header {
      display: flex;
      width: min-content;
      min-width: 100%;
      box-sizing: border-box;
      padding: 0.15em;
      padding-left: 0.5em;
      padding-right: 0.5em;
      user-select: none;
    }

    .row {
      display: flex;
      width: min-content;
      min-width: 100%;
      box-sizing: border-box;
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

    .text-cell, .text-cell-header {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    `;

  constructor() {
    super();

    this._columnDescriptions = [
      {
        key: "default",
        get: (item) => item,
      },
    ];
    this._showHeader = false;
    this.items = [];
    this.itemEqualFunc = null;

    this.contents = html.div({
      class: "contents",
      onclick: (event) => this._clickHandler(event),
      ondblclick: (event) => this._dblClickHandler(event),
      tabIndex: 1,
    });

    this.container = html.div({ class: "container" }, [this.contents]);

    this.container.addEventListener(
      "scroll",
      (event) => this._scrollHandler(event),
      false
    );
    this.contents.addEventListener(
      "keydown",
      (event) => this._keyDownHandler(event),
      false
    );
    this.contents.addEventListener(
      "keyup",
      (event) => this._keyUpHandler(event),
      false
    );
    this.selectedItemIndex = undefined;
    this.allowEmptySelection = true;
  }

  render() {
    const contents = [];
    if (this._showHeader) {
      contents.push(this._makeHeader());
    }
    contents.push(this.container);
    return contents;
  }

  get showHeader() {
    return this._showHeader;
  }

  set showHeader(onOff) {
    this._showHeader = onOff;
    this.requestUpdate();
  }

  get columnDescriptions() {
    return this._columnDescriptions;
  }

  set columnDescriptions(columnDescriptions) {
    this._columnDescriptions = columnDescriptions;
    const identifierDescs = columnDescriptions.filter((desc) => desc.isIdentifierKey);
    const getters = (identifierDescs.length ? identifierDescs : columnDescriptions).map(
      (desc) => desc.get || ((item) => item[desc.key])
    );
    this.itemEqualFunc = (a, b) => getters.every((getter) => getter(a) === getter(b));
    this.setItems(this.items);
    this.requestUpdate();
  }

  setItems(items) {
    const selectedItem = this.getSelectedItem();
    this.style.display = items?.length ? "grid" : "none";
    this.contents.innerHTML = "";
    this.items = items;
    this._itemsBackLog = Array.from(items);
    this.setSelectedItem(selectedItem);
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
      this.container.scrollTop + this.offsetHeight + 200 > this.contents.offsetHeight
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
        let cell;
        if (colDesc.cellFactory) {
          cell = html.div(
            {
              style: colDesc.width ? `display: flex; width: ${colDesc.width};` : "",
            },
            [colDesc.cellFactory(item, colDesc)]
          );
        } else {
          cell = document.createElement("div");
          cell.className = "text-cell " + colDesc.key;
          if (colDesc.width) {
            cell.style.width = colDesc.width;
          }
          const value = colDesc.get ? colDesc.get(item) : item[colDesc.key];
          cell.append(value);
        }
        row.appendChild(cell);
      }

      this.contents.appendChild(row);
      rowIndex++;
    }
  }

  _makeHeader() {
    const header = html.div({ class: "header" });

    for (const colDesc of this.columnDescriptions) {
      const cell = document.createElement("div");
      cell.className = "text-cell-header " + colDesc.key;
      if (colDesc.width) {
        cell.style.width = colDesc.width;
      }
      const value = colDesc.title || colDesc.key;
      cell.append(value);
      header.appendChild(cell);
    }
    this.headerContainer = html.div({ class: "header-container" }, [header]);
    this.headerContainer.addEventListener(
      "scroll",
      (event) => this._headerScrollHandler(event),
      false
    );
    return this.headerContainer;
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
    event.stopImmediatePropagation();
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

  _headerScrollHandler(event) {
    if (this.container.scrollLeft != this.headerContainer.scrollLeft) {
      this.container.scrollLeft = this.headerContainer.scrollLeft;
    }
  }

  _scrollHandler(event) {
    if (
      this.headerContainer &&
      this.headerContainer.scrollLeft != this.container.scrollLeft
    ) {
      this.headerContainer.scrollLeft = this.container.scrollLeft;
    }
    this._addMoreItemsIfNeeded();
  }
}

customElements.define("ui-list", UIList);
