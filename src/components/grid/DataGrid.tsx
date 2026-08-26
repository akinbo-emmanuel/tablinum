"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { colToLetter, toA1, type Coord } from "@/lib/grid/address";
import {
  COL_HEADER_HEIGHT,
  OVERSCAN_COLS,
  OVERSCAN_ROWS,
  ROW_GUTTER_WIDTH,
  ROW_HEIGHT,
} from "@/lib/grid/constants";
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
  const inputRef = useRef<HTMLInputElement>(null);
  const [viewport, setViewport] = useState({
    width: 0,
    height: 0,
    scrollTop: 0,
    scrollLeft: 0,
  });
  const dragging = useRef(false);

  const colOffsets = useMemo(() => {
    const offsets = [0];
    for (let i = 0; i < book.colWidths.length; i++) {
      offsets.push(offsets[i] + book.colWidths[i]);
    }
    return offsets;
  }, [book.colWidths]);

  const totalWidth = colOffsets[colOffsets.length - 1] ?? 0;
  const totalHeight = book.rows * ROW_HEIGHT;

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const sync = () => {
      setViewport({
        width: el.clientWidth,
        height: el.clientHeight,
        scrollTop: el.scrollTop,
        scrollLeft: el.scrollLeft,
      });
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    el.addEventListener("scroll", sync, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", sync);
    };
  }, []);

  const startRow = Math.max(
    0,
    Math.floor(viewport.scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS,
  );
  const endRow = Math.min(
    book.rows - 1,
    Math.ceil((viewport.scrollTop + viewport.height) / ROW_HEIGHT) +
      OVERSCAN_ROWS,
  );

  const startCol = useMemo(() => {
    let i = 0;
    while (i < book.cols - 1 && colOffsets[i + 1] < viewport.scrollLeft) i += 1;
    return Math.max(0, i - OVERSCAN_COLS);
  }, [book.cols, colOffsets, viewport.scrollLeft]);

  const endCol = useMemo(() => {
    const right = viewport.scrollLeft + Math.max(viewport.width, 1);
    let i = startCol;
    while (i < book.cols - 1 && colOffsets[i] < right) i += 1;
    return Math.min(book.cols - 1, i + OVERSCAN_COLS);
  }, [book.cols, colOffsets, startCol, viewport.scrollLeft, viewport.width]);

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

  const visibleRows: number[] = [];
  for (let r = startRow; r <= endRow; r++) visibleRows.push(r);
  const visibleCols: number[] = [];
  for (let c = startCol; c <= endCol; c++) visibleCols.push(c);

  return (
    <div
      ref={scroller}
      className="grid-scroller relative h-full overflow-auto bg-[var(--paper)]"
      role="grid"
      aria-rowcount={book.rows}
      aria-colcount={book.cols}
      aria-activedescendant={`cell-${book.active.row}-${book.active.col}`}
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
        }}
      >
        {visibleRows.map((row) => (
          <div
            key={row}
            role="row"
            aria-rowindex={row + 1}
            className="absolute"
            style={{
              top: row * ROW_HEIGHT + COL_HEADER_HEIGHT,
              left: ROW_GUTTER_WIDTH,
              height: ROW_HEIGHT,
              width: totalWidth,
            }}
          >
            {visibleCols.map((col) => {
              const coord = { row, col };
              const active = book.active.row === row && book.active.col === col;
              const selected = book.inSelection(coord);
              const raw = book.getRaw(row, col);
              const display = book.getDisplay(row, col);
              const isError = display.startsWith("#");
              const header = row === 0;
              return (
                <div
                  key={col}
                  id={`cell-${row}-${col}`}
                  role="gridcell"
                  aria-colindex={col + 1}
                  aria-selected={selected}
                  className={[
                    "absolute box-border flex items-center overflow-hidden border-r border-b border-[var(--line)] px-2 text-[13px] leading-none",
                    header ? "font-medium" : "",
                    selected && !active ? "bg-[var(--select)]" : "bg-[var(--paper)]",
                    active
                      ? "z-10 bg-[var(--paper)] ring-2 ring-inset ring-[var(--accent)]"
                      : "",
                    isError ? "text-[var(--danger)]" : "text-[var(--ink)]",
                  ].join(" ")}
                  style={{
                    left: colOffsets[col],
                    width: book.colWidths[col],
                    height: ROW_HEIGHT,
                  }}
                  title={raw.startsWith("=") ? raw : undefined}
                >
                  {active && editing ? (
                    <input
                      ref={inputRef}
                      aria-label={`Edit ${toA1(row, col)}`}
                      className="h-full w-full bg-transparent font-mono text-[13px] text-[var(--ink)] outline-none"
                      value={draft}
                      onChange={(e) => onDraftChange(e.target.value)}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="w-full truncate font-mono">{display}</span>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {visibleCols.map((col) => (
          <div
            key={`h-${col}`}
            className="absolute z-20 flex items-center justify-center border-r border-b border-[var(--line)] bg-[var(--header)] text-[11px] font-medium tracking-wide text-[var(--muted)]"
            style={{
              top: viewport.scrollTop,
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

        {visibleRows.map((row) => (
          <div
            key={`g-${row}`}
            className="absolute z-20 flex items-center justify-end border-r border-b border-[var(--line)] bg-[var(--header)] pr-2 text-[11px] tabular-nums text-[var(--muted)]"
            style={{
              top: COL_HEADER_HEIGHT + row * ROW_HEIGHT,
              left: viewport.scrollLeft,
              width: ROW_GUTTER_WIDTH,
              height: ROW_HEIGHT,
            }}
          >
            {row + 1}
          </div>
        ))}

        <div
          className="absolute z-30 border-r border-b border-[var(--line)] bg-[var(--header)]"
          style={{
            top: viewport.scrollTop,
            left: viewport.scrollLeft,
            width: ROW_GUTTER_WIDTH,
            height: COL_HEADER_HEIGHT,
          }}
        />
      </div>
    </div>
  );
}
