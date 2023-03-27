const LIST_CHUNK_SIZE = 200; // the amount of items added to the list at a time

export class UIList extends HTMLElement {
  static styles = `
    :host {
      overflow: scroll;
      border: solid 1px var(--ui-list-border-color);
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
      border-top: solid 1px var(--ui-list-row-border-color);
      color: var(--ui-list-row-foreground-color);
      background-color: var(--ui-list-row-background-color);
      padding: 0.15em;
      padding-left: 0.5em;
      padding-right: 0.5em;
      cursor: pointer;
    }

    .contents > .selected {
      background-color: var(--ui-list-row-selected-background-color);
    }

    .contents > .row > .text-cell {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    `;

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.tabIndex = "1";

    this._columnDescriptions = [
      {
        key: "default",
        get: (item) => item,
      },
    ];
    this.items = [];
    this.itemEqualFunc = null;

    const style = document.createElement("style");
    style.textContent = UIList.styles;
    this.shadowRoot.appendChild(style);

    this.contents = document.createElement("div");
    this.contents.className = "contents";
    this.shadowRoot.appendChild(this.contents);
    this.contents.addEventListener(
      "click",
      (event) => this._clickHandler(event),
      false
    );
    this.contents.addEventListener(
      "dblclick",
      (event) => this._dblClickHandler(event),
      false
    );
    this.addEventListener("scroll", (event) => this._scrollHandler(event), false);
    this.addEventListener("keydown", (event) => this._keyDownHandler(event), false);
    this.addEventListener("keyup", (event) => this._keyUpHandler(event), false);
    this.selectedItemIndex = undefined;
    this.classList.add("empty");
  }

  connectedCallback() {
    //
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
    this.setSelectedItemIndex(this._getRowIndexFromTarget(event.target), true);
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
