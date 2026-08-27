import {
  COL_HEADER_HEIGHT,
  ROW_GUTTER_WIDTH,
  ROW_HEIGHT,
} from "./constants";

export function paintRowGutter(
  scroller: HTMLElement,
  gutter: HTMLElement,
  rowCount: number,
) {
  const viewH = Math.max(0, scroller.clientHeight - COL_HEADER_HEIGHT);
  const count = Math.max(12, Math.ceil(viewH / ROW_HEIGHT) + 8);
  while (gutter.childElementCount < count) {
    const node = document.createElement("div");
    node.className =
      "absolute right-0 box-border flex items-center justify-end border-b border-[var(--line)] pr-2 text-[11px] tabular-nums text-[var(--muted)]";
    node.style.width = `${ROW_GUTTER_WIDTH}px`;
    node.style.height = `${ROW_HEIGHT}px`;
    gutter.appendChild(node);
  }
  while (gutter.childElementCount > count) {
    gutter.lastElementChild?.remove();
  }

  const startRow = Math.max(0, Math.floor(scroller.scrollTop / ROW_HEIGHT) - 2);
  const origin = startRow * ROW_HEIGHT - scroller.scrollTop;

  for (let i = 0; i < gutter.childElementCount; i++) {
    const node = gutter.children[i] as HTMLElement;
    const row = startRow + i;
    if (row >= rowCount) {
      node.textContent = "";
      node.style.visibility = "hidden";
      continue;
    }
    node.style.visibility = "visible";
    node.textContent = String(row + 1);
    node.style.transform = `translateY(${origin + i * ROW_HEIGHT}px)`;
  }
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

export function paintCellLayer(
  scroller: HTMLElement,
  layer: HTMLElement,
  api: CellPaintApi,
) {
  const { scrollTop, scrollLeft, clientHeight } = scroller;
  const nRows = Math.max(12, Math.ceil(clientHeight / ROW_HEIGHT) + 8);
  const nCols = api.cols;
  const needed = nRows * nCols;

  while (layer.childElementCount < needed) {
    const node = document.createElement("div");
    node.className =
      "absolute top-0 left-0 box-border flex items-center overflow-hidden px-2 font-mono text-[13px] leading-none text-[var(--ink)]";
    node.style.height = `${ROW_HEIGHT}px`;
    node.style.willChange = "transform";
    layer.appendChild(node);
  }
  while (layer.childElementCount > needed) {
    layer.lastElementChild?.remove();
  }

  const startRow = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);

  for (let i = 0; i < nRows; i++) {
    const row = startRow + i;
    const y = row * ROW_HEIGHT - scrollTop;
    for (let j = 0; j < nCols; j++) {
      const node = layer.children[i * nCols + j] as HTMLElement;
      if (row >= api.rows) {
        node.style.visibility = "hidden";
        continue;
      }
      const hide =
        api.hideCell !== null &&
        api.hideCell.row === row &&
        api.hideCell.col === j;
      const text = hide ? "" : api.getDisplay(row, j);
      const key = `${row}:${j}:${text}`;
      node.style.visibility = "visible";
      node.style.transform = `translate3d(${api.colOffsets[j] - scrollLeft}px, ${y}px, 0)`;
      node.style.width = `${api.colWidths[j]}px`;
      node.style.fontWeight = row === 0 ? "500" : "400";
      node.style.color = text.startsWith("#") ? "var(--danger)" : "var(--ink)";
      if (node.dataset.paint !== key) {
        node.dataset.paint = key;
        node.textContent = text;
      }
    }
  }
}

export function paintSelectionChrome(
  scroller: HTMLElement,
  selectEl: HTMLElement,
  activeEl: HTMLElement,
  api: CellPaintApi,
) {
  const { scrollTop, scrollLeft } = scroller;
  const { start, end } = api.selection;
  selectEl.style.transform = `translate3d(${api.colOffsets[start.col] - scrollLeft}px, ${start.row * ROW_HEIGHT - scrollTop}px, 0)`;
  selectEl.style.width = `${api.colOffsets[end.col + 1] - api.colOffsets[start.col]}px`;
  selectEl.style.height = `${(end.row - start.row + 1) * ROW_HEIGHT}px`;
  activeEl.style.transform = `translate3d(${api.colOffsets[api.active.col] - scrollLeft}px, ${api.active.row * ROW_HEIGHT - scrollTop}px, 0)`;
  activeEl.style.width = `${api.colWidths[api.active.col]}px`;
  activeEl.style.height = `${ROW_HEIGHT}px`;
}

export function columnGridBackground(
  colOffsets: number[],
  totalWidth: number,
): {
  backgroundImage: string;
  backgroundPosition: string;
  backgroundRepeat: string;
  backgroundSize: string;
} {
  const gutter = ROW_GUTTER_WIDTH;
  const stops: string[] = [`transparent ${gutter}px`];
  for (let i = 0; i < colOffsets.length; i++) {
    const x = gutter + colOffsets[i];
    stops.push(
      `transparent ${x}px`,
      `var(--line) ${x}px`,
      `var(--line) ${x + 1}px`,
      `transparent ${x + 1}px`,
    );
  }
  const vertical = `linear-gradient(to right, ${stops.join(", ")})`;
  const horizontal = `repeating-linear-gradient(to bottom, transparent 0, transparent ${ROW_HEIGHT - 1}px, var(--line) ${ROW_HEIGHT - 1}px, var(--line) ${ROW_HEIGHT}px)`;
  return {
    backgroundImage: `${horizontal}, ${vertical}`,
    backgroundPosition: `0 ${COL_HEADER_HEIGHT}px, 0 0`,
    backgroundRepeat: "repeat, no-repeat",
    backgroundSize: `100% ${ROW_HEIGHT}px, ${totalWidth + gutter}px 100%`,
  };
}
