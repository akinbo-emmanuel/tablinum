import { ROW_GUTTER_WIDTH, ROW_HEIGHT, OVERSCAN_ROWS } from "./constants";

// Sheet coordinates keep native scrolling synchronized. Recycle in batches
// with a buffer for several wheel/trackpad frames in either direction.
export function visibleRowWindow(scroller: HTMLElement) {
  const batch = OVERSCAN_ROWS;
  const start = Math.max(0, Math.floor(scroller.scrollTop / ROW_HEIGHT / batch) * batch - batch);
  const count = Math.ceil(scroller.clientHeight / ROW_HEIGHT) + batch * 3;
  return { start, count };
}

export type CellPaintApi = {
  rows: number;
  cols: number;
  colOffsets: number[];
  colWidths: number[];
  getDisplay: (row: number, col: number) => string;
  hideCell: { row: number; col: number } | null;
  active: { row: number; col: number };
  selection: { start: { row: number; col: number }; end: { row: number; col: number } };
};

type RowPaint = {
  row: number;
  getDisplay: CellPaintApi["getDisplay"];
  colWidths: number[];
  hiddenCol: number | null;
};
const paintedRows = new WeakMap<HTMLElement, RowPaint>();

// Retain overlapping rows by identity. Only rows leaving the buffer are reused
// for incoming rows. Avoid moving existing DOM subtrees on the scroll path;
// aria-rowindex records their logical position in the virtual sheet.
function reconcileRows(layer: HTMLElement, start: number, count: number, create: () => HTMLElement) {
  const end = start + count;
  const retained = new Map<number, HTMLElement>();
  const spare: HTMLElement[] = [];
  for (const child of Array.from(layer.children) as HTMLElement[]) {
    // Fast Refresh may preserve nodes from an older painter implementation.
    if (child.dataset.row === undefined) {
      child.remove();
      continue;
    }
    const row = Number(child.dataset.row);
    if (row >= start && row < end) retained.set(row, child);
    else spare.push(child);
  }
  const rows: HTMLElement[] = [];
  for (let row = start; row < end; row++) {
    const node = retained.get(row) ?? spare.pop() ?? create();
    if (node.dataset.row !== String(row)) {
      node.dataset.row = String(row);
      node.setAttribute("aria-rowindex", String(row + 1));
      node.style.top = `${row * ROW_HEIGHT}px`;
    }
    if (!node.parentElement) layer.appendChild(node);
    rows.push(node);
  }
  for (const node of spare) node.remove();
  return rows;
}

export function paintRowGutter(window: { start: number; count: number }, gutter: HTMLElement, rowCount: number) {
  const { start, count } = window;
  const rows = reconcileRows(gutter, start, Math.min(count, rowCount - start), () => {
    const node = document.createElement("div");
    node.setAttribute("role", "rowheader");
    node.className = "absolute left-0 box-border flex items-center justify-end border-r border-b border-[var(--line)] bg-[var(--header)] pr-2 text-[11px] tabular-nums text-[var(--muted)]";
    node.style.cssText = `width:${ROW_GUTTER_WIDTH}px;height:${ROW_HEIGHT}px;contain:strict`;
    return node;
  });
  for (const node of rows) {
    const label = String(Number(node.dataset.row) + 1);
    if (node.textContent !== label) node.textContent = label;
  }
}

export function paintCellLayer(window: { start: number; count: number }, layer: HTMLElement, api: CellPaintApi) {
  const { start, count } = window;
  const rows = reconcileRows(layer, start, Math.min(count, api.rows - start), () => {
    const node = document.createElement("div");
    node.setAttribute("role", "row");
    node.className = "absolute left-0";
    // Bound paint invalidation to a row, not the 1.4-million-pixel sheet.
    node.style.cssText = `height:${ROW_HEIGHT}px;contain:strict`;
    return node;
  });
  for (const node of rows) {
    const row = Number(node.dataset.row);
    const hiddenCol = api.hideCell?.row === row ? api.hideCell.col : null;
    const previous = paintedRows.get(node);
    if (previous?.row === row && previous.getDisplay === api.getDisplay &&
        previous.colWidths === api.colWidths && previous.hiddenCol === hiddenCol) continue;

    node.style.width = `${api.colOffsets[api.cols]}px`;
    for (let col = 0; col < api.cols; col++) {
      let cell = node.children[col] as HTMLElement | undefined;
      if (!cell) {
        cell = document.createElement("div");
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-colindex", String(col + 1));
        cell.className = "absolute top-0 box-border flex items-center overflow-hidden border-r border-b border-[var(--line)] px-2 font-mono text-[13px] leading-none text-[var(--ink)]";
        cell.style.height = `${ROW_HEIGHT}px`;
        node.appendChild(cell);
      }
      if (!previous || previous.colWidths !== api.colWidths) {
        cell.style.left = `${api.colOffsets[col]}px`;
        cell.style.width = `${api.colWidths[col]}px`;
      }
      if (previous?.row !== row) cell.setAttribute("aria-rowindex", String(row + 1));
      const text = col === hiddenCol ? "" : api.getDisplay(row, col);
      if (cell.textContent !== text) cell.textContent = text;
      cell.style.color = text.startsWith("#") ? "var(--danger)" : "var(--ink)";
    }
    node.style.fontWeight = row === 0 ? "500" : "400";
    paintedRows.set(node, { row, getDisplay: api.getDisplay, colWidths: api.colWidths, hiddenCol });
  }
}

export function paintSelectionChrome(selectEl: HTMLElement, activeEl: HTMLElement, api: CellPaintApi) {
  const { start, end } = api.selection;
  selectEl.style.left = `${api.colOffsets[start.col]}px`;
  selectEl.style.top = `${start.row * ROW_HEIGHT}px`;
  selectEl.style.width = `${api.colOffsets[end.col + 1] - api.colOffsets[start.col]}px`;
  selectEl.style.height = `${(end.row - start.row + 1) * ROW_HEIGHT}px`;
  activeEl.style.left = `${api.colOffsets[api.active.col]}px`;
  activeEl.style.top = `${api.active.row * ROW_HEIGHT}px`;
  activeEl.style.width = `${api.colWidths[api.active.col]}px`;
  activeEl.style.height = `${ROW_HEIGHT}px`;
}
