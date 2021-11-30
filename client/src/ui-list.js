const LIST_CHUNK_SIZE = 200;  // the amount of items added to the list at a time

// TODO: from CSS?
const LIST_ROW_SELECTED_BACKGROUND_COLOR = "#FD7"
const LIST_ROW_UNSELECTED_BACKGROUND_COLOR = "#FFF";
const CELL_STYLE = "border-top: 1px solid lightgray; padding: 0.15em; padding-left: 0.5em; padding-right: 0.5em; cursor: pointer;"


export class List {

  constructor(queryPrefix, columnDescriptions) {
    this.queryPrefix = queryPrefix;
    const containerID = `#${queryPrefix}-container`
    this.container = document.querySelector(containerID);
    if (!this.container) {
      throw Error(`Expecting an element with id="${containerID}"`);
    }
    if (this.container.children.length != 0) {
      throw Error("list container must be empty");
    }
    this.container.style = "overflow: scroll";
    this.contents = document.createElement("div");
    this.contents.setAttribute("id", `${queryPrefix}-contents`)
    this.contents.style = "display: flex; flex-direction: column;"
    this.container.appendChild(this.contents);
    this.contents.addEventListener("click", event => this._clickHandler(event), false);
    this.container.addEventListener("scroll", event => this._scrollHandler(event), false)
    this.container.addEventListener("keydown", event => this._keyDownHandler(event), false)
    this.selectedItemIndex = undefined;
  }

  setItems(items) {
    this.contents.innerHTML = "";
    this.items = items;
    this._itemsBackLog = Array.from(items);
    this._addMoreItemsIfNeeded();
    this.selectedItemIndex = undefined;
  }

  getSelectedItem() {
    if (this.selectedItemIndex === undefined) {
      return undefined;
    }
    return this.items[this.selectedItemIndex];
  }

  setSelectedItem(item) {
    const index = this.items.indexOf(item);
    if (index >= 0) {
      this._selectByRowElement(this.contents.children[index])
    } else {
      this._selectByRowElement(undefined)
    }
  }

  addEventListener(eventName, handler, options) {
    this.container.addEventListener(eventName, handler, options);
  }

  _addMoreItemsIfNeeded() {
    while (
      this._itemsBackLog.length > 0 &&
      this.container.scrollTop + this.container.offsetHeight + 200 > this.contents.offsetHeight
    ) {
      this._addMoreItems();
    }
  }

  _addMoreItems() {
    const items = this._itemsBackLog.splice(0, LIST_CHUNK_SIZE);
    let rowIndex = this.contents.childElementCount;
    for (const item of items) {
      const row = document.createElement("div");
      const cell = document.createElement("div");
      row.setAttribute("class", this.queryPrefix + "-row");
      row.rowIndex = rowIndex;
      cell.setAttribute("class", this.queryPrefix + "-cell");
      cell.append(item);
      row.appendChild(cell);
      this.contents.appendChild(row);
      row.setAttribute(
        "style", CELL_STYLE + `background-color: ${LIST_ROW_UNSELECTED_BACKGROUND_COLOR};`
      );
      rowIndex++;
    }
  }

  _clickHandler(event) {
    const target = event.target;
    if (target.parentNode === this.contents) {
      // clicked on row
      this._selectByRowElement(target);
    } else if (target.parentNode.parentNode === this.contents) {
      // clicked on cell
      this._selectByRowElement(target.parentNode);
    }
  }

  _selectByRowElement(row) {
    if (row && row.rowIndex === this.selectedItemIndex) {
      // nothing to do
      return;
    }
    if (this.selectedItemIndex !== undefined) {
      const currentRow = this.contents.children[this.selectedItemIndex];
      currentRow.setAttribute(
        "style", CELL_STYLE + `background-color: ${LIST_ROW_UNSELECTED_BACKGROUND_COLOR};`
      );
    }
    if (row) {
      row.setAttribute(
        "style", CELL_STYLE + `background-color: ${LIST_ROW_SELECTED_BACKGROUND_COLOR};`
      );
      this.selectedItemIndex = row.rowIndex;
    } else {
      this.selectedItemIndex = undefined;
    }
    const event = new CustomEvent("listSelectionChanged", {
      "bubbles": false,
      "detail": this,
    });
    this.container.dispatchEvent(event);
  }

  _keyDownHandler(event) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    const selectedRow = this.contents.children[this.selectedItemIndex];
    if (selectedRow) {
      let newRow;
      if (event.key === "ArrowUp") {
        newRow = selectedRow.previousElementSibling;
      } else {
        newRow = selectedRow.nextElementSibling;
      }
      if (newRow) {
        newRow.scrollIntoView({behavior: "auto", block: "nearest", inline: "nearest"});
        this._selectByRowElement(newRow);
      }
    }
    event.preventDefault();
  }

  _scrollHandler(event) {
    this._addMoreItemsIfNeeded();
  }

}
