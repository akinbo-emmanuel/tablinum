"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { colToLetter, normalizeRange, toA1, type Coord } from "@/lib/grid/address";
import {
  COL_HEADER_HEIGHT,
  ROW_GUTTER_WIDTH,
  ROW_HEIGHT,
} from "@/lib/grid/constants";
import {
  columnGridBackground,
  paintCellLayer,
  paintRowGutter,
  paintSelectionChrome,
  type CellPaintApi,
} from "@/lib/grid/paint";
import type { WorkbookApi } from "@/hooks/useWorkbook";

type Props = {
  book: WorkbookApi;
  editing: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onBeginEdit: (replace: boolean) => void;
  onCommitEdit: (move?: Coord) => void;
  onCancelEdit: () => void;
};

export function DataGrid({
  book,
  editing,
  draft,
  onDraftChange,
  onBeginEdit,
  onCommitEdit,
  onCancelEdit,
}: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const cellLayerRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);
  const paintApiRef = useRef<CellPaintApi | null>(null);

  const colOffsets = useMemo(() => {
    const offsets = [0];
    for (let i = 0; i < book.colWidths.length; i++) {
      offsets.push(offsets[i] + book.colWidths[i]);
    }
    return offsets;
  }, [book.colWidths]);

  const totalWidth = colOffsets[colOffsets.length - 1] ?? 0;
  const totalHeight = book.rows * ROW_HEIGHT;
  const gridBackground = useMemo(
    () => columnGridBackground(colOffsets, totalWidth),
    [colOffsets, totalWidth],
  );

  const paintFrame = useCallback(() => {
    const el = scroller.current;
    const gutter = gutterRef.current;
    const layer = cellLayerRef.current;
    const selectEl = selectRef.current;
    const activeEl = activeRef.current;
    const api = paintApiRef.current;
    if (!el || !gutter || !layer || !selectEl || !activeEl || !api) return;
    paintRowGutter(el, gutter, api.rows);
    paintCellLayer(el, layer, api);
    paintSelectionChrome(el, selectEl, activeEl, api);
  }, []);

  useLayoutEffect(() => {
    paintApiRef.current = {
      rows: book.rows,
      cols: book.cols,
      colOffsets,
      colWidths: book.colWidths,
      getDisplay: book.getDisplay,
      hideCell: editing ? book.active : null,
      active: book.active,
      selection: normalizeRange(book.active, book.anchor),
    };
    paintFrame();
  }, [
    book.active,
    book.anchor,
    book.cols,
    book.colWidths,
    book.getDisplay,
    book.rows,
    colOffsets,
    editing,
    paintFrame,
  ]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onScroll = () => paintFrame();
    el.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => paintFrame());
    ro.observe(el);
    paintFrame();
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [paintFrame]);

  const scrollActiveIntoView = useCallback(
    (coord: Coord) => {
      const el = scroller.current;
      if (!el) return;
      const top = coord.row * ROW_HEIGHT;
      const left = colOffsets[coord.col];
      const right = colOffsets[coord.col + 1];
      const bottom = top + ROW_HEIGHT;
      const viewTop = el.scrollTop;
      const viewBottom = el.scrollTop + el.clientHeight - COL_HEADER_HEIGHT;
      const viewLeft = el.scrollLeft;
      const viewRight = el.scrollLeft + el.clientWidth - ROW_GUTTER_WIDTH;
      if (top < viewTop) el.scrollTop = top;
      else if (bottom > viewBottom) el.scrollTop = bottom - (el.clientHeight - COL_HEADER_HEIGHT);
      if (left < viewLeft) el.scrollLeft = left;
      else if (right > viewRight) {
        el.scrollLeft = right - (el.clientWidth - ROW_GUTTER_WIDTH);
      }
    },
    [colOffsets],
  );

  useEffect(() => {
    if (!editing) scrollActiveIntoView(book.active);
  }, [book.active, editing, scrollActiveIntoView]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing, book.active]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const meta = event.metaKey || event.ctrlKey;
    if (editing) {
      if (event.key === "Enter") {
        event.preventDefault();
        onCommitEdit({ row: 1, col: 0 });
      } else if (event.key === "Tab") {
        event.preventDefault();
        onCommitEdit({ row: 0, col: event.shiftKey ? -1 : 1 });
      } else if (event.key === "Escape") {
        event.preventDefault();
        onCancelEdit();
      }
      return;
    }

    if (meta && event.key.toLowerCase() === "c") {
      event.preventDefault();
      void book.copySelection();
      return;
    }
    if (meta && event.key.toLowerCase() === "x") {
      event.preventDefault();
      void book.copySelection().then(() => book.clearSelection());
      return;
    }
    if (meta && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) book.redo();
      else book.undo();
      return;
    }
    if (meta && event.key.toLowerCase() === "a") {
      event.preventDefault();
      book.select(
        { row: book.rows - 1, col: book.cols - 1 },
        { row: 0, col: 0 },
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (event.shiftKey) {
        book.moveTo({ row: book.active.row - 1, col: book.active.col });
      } else {
        onBeginEdit(false);
      }
      return;
    }
    if (event.key === "F2") {
      event.preventDefault();
      onBeginEdit(false);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      book.moveTo(
        {
          row: book.active.row,
          col: book.active.col + (event.shiftKey ? -1 : 1),
        },
        false,
      );
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      book.clearSelection();
      return;
    }

    const step: Record<string, Coord> = {
      ArrowUp: { row: -1, col: 0 },
      ArrowDown: { row: 1, col: 0 },
      ArrowLeft: { row: 0, col: -1 },
      ArrowRight: { row: 0, col: 1 },
    };
    if (event.key === "Home") {
      event.preventDefault();
      book.moveTo(
        meta ? { row: 0, col: 0 } : { row: book.active.row, col: 0 },
        event.shiftKey,
      );
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      book.moveTo(
        meta
          ? { row: book.rows - 1, col: book.cols - 1 }
          : { row: book.active.row, col: book.cols - 1 },
        event.shiftKey,
      );
      return;
    }
    const delta = step[event.key];
    if (delta) {
      event.preventDefault();
      book.moveTo(
        { row: book.active.row + delta.row, col: book.active.col + delta.col },
        event.shiftKey,
      );
      return;
    }

    if (event.key.length === 1 && !meta && !event.altKey) {
      onBeginEdit(true);
      onDraftChange(event.key);
    }
  };

  const onPaste = (event: ClipboardEvent) => {
    const text = event.clipboardData.getData("text/plain");
    if (!text) return;
    event.preventDefault();
    if (editing) return;
    book.pasteTsv(text);
  };

  const pointerToCoord = (event: PointerEvent) => {
    const el = scroller.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = event.clientX - rect.left + el.scrollLeft - ROW_GUTTER_WIDTH;
    const y = event.clientY - rect.top + el.scrollTop - COL_HEADER_HEIGHT;
    if (x < 0 || y < 0) return null;
    const row = Math.min(book.rows - 1, Math.max(0, Math.floor(y / ROW_HEIGHT)));
    let col = 0;
    while (col < book.cols - 1 && colOffsets[col + 1] <= x) col += 1;
    return { row, col };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-resize]") || target.closest("input")) return;
    const coord = pointerToCoord(event);
    if (!coord) return;
    if (editing) onCommitEdit();
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    book.select(coord, event.shiftKey ? book.anchor : coord);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    const coord = pointerToCoord(event);
    if (coord) book.select(coord, book.anchor);
  };

  const onPointerUp = () => {
    dragging.current = false;
  };

  const onDoubleClick = (event: PointerEvent<HTMLDivElement>) => {
    if (pointerToCoord(event)) onBeginEdit(false);
  };

  const resizeCol = (col: number, event: PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    event.preventDefault();
    const startX = event.clientX;
    const startW = book.colWidths[col];
    const onMove = (e: globalThis.PointerEvent) => {
      book.resizeCol(col, startW + (e.clientX - startX));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="relative h-full min-h-0">
      <div
        ref={scroller}
        className="grid-scroller h-full overflow-auto bg-[var(--paper)]"
        role="grid"
        aria-rowcount={book.rows}
        aria-colcount={book.cols}
        aria-label={`Spreadsheet, active cell ${toA1(book.active.row, book.active.col)}`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        <div
          className="relative"
          style={{
            width: totalWidth + ROW_GUTTER_WIDTH,
            height: totalHeight + COL_HEADER_HEIGHT,
            ...gridBackground,
          }}
        >
          <div
            className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--header)]"
            style={{
              height: COL_HEADER_HEIGHT,
              width: totalWidth + ROW_GUTTER_WIDTH,
            }}
          >
            <div
              className="sticky left-0 z-30 border-r border-[var(--line)] bg-[var(--header)]"
              style={{ width: ROW_GUTTER_WIDTH, height: COL_HEADER_HEIGHT }}
            />
            {Array.from({ length: book.cols }, (_, col) => (
              <div
                key={`h-${col}`}
                className="absolute top-0 flex items-center justify-center border-r border-[var(--line)] text-[11px] font-medium tracking-wide text-[var(--muted)]"
                style={{
                  left: ROW_GUTTER_WIDTH + colOffsets[col],
                  width: book.colWidths[col],
                  height: COL_HEADER_HEIGHT,
                }}
              >
                {colToLetter(col)}
                <div
                  data-resize=""
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={`Resize column ${colToLetter(col)}`}
                  className="absolute top-0 right-0 z-10 h-full w-1.5 cursor-col-resize hover:bg-[var(--accent)]"
                  onPointerDown={(e) => resizeCol(col, e)}
                />
              </div>
            ))}
          </div>
          {editing ? (
            <input
              ref={inputRef}
              aria-label={`Edit ${toA1(book.active.row, book.active.col)}`}
              className="absolute z-20 box-border bg-[var(--paper)] px-2 font-mono text-[13px] text-[var(--ink)] outline-none ring-2 ring-inset ring-[var(--accent)]"
              style={{
                top: COL_HEADER_HEIGHT + book.active.row * ROW_HEIGHT,
                left: ROW_GUTTER_WIDTH + colOffsets[book.active.col],
                width: book.colWidths[book.active.col],
                height: ROW_HEIGHT,
              }}
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
            />
          ) : null}
        </div>
      </div>
      <div
        ref={gutterRef}
        aria-hidden
        className="pointer-events-none absolute z-20 overflow-hidden border-r border-[var(--line)] bg-[var(--header)]"
        style={{
          left: 0,
          top: COL_HEADER_HEIGHT,
          bottom: 0,
          width: ROW_GUTTER_WIDTH,
        }}
      />
      <div
        className="pointer-events-none absolute z-10 overflow-hidden"
        style={{
          left: ROW_GUTTER_WIDTH,
          top: COL_HEADER_HEIGHT,
          right: 0,
          bottom: 0,
        }}
      >
        <div
          ref={selectRef}
          className="absolute top-0 left-0 bg-[var(--select)]"
          style={{ height: ROW_HEIGHT }}
        />
        <div ref={cellLayerRef} className="absolute inset-0" />
        <div
          ref={activeRef}
          className="absolute top-0 left-0 box-border ring-2 ring-inset ring-[var(--accent)]"
          style={{ height: ROW_HEIGHT }}
        />
      </div>
    </div>
  );
}
