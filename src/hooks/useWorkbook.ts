"use client";

import { useCallback, useMemo, useReducer } from "react";
import {
  cellKey,
  clampCoord,
  inRange,
  normalizeRange,
  parseCellKey,
  rangeSize,
  type Coord,
} from "@/lib/grid/address";
import { parseTsv, rangeToTsv } from "@/lib/grid/clipboard";
import {
  COL_COUNT,
  DEFAULT_COL_WIDTH,
  MAX_HISTORY,
  MIN_COL_WIDTH,
  ROW_COUNT,
} from "@/lib/grid/constants";
import { evaluateRaw, formatValue } from "@/lib/grid/formulas";
import { demoCell, type Cells } from "@/lib/grid/seed";

type HistoryEntry = { before: Cells; after: Cells };
type Source = "demo" | "blank";

type State = {
  cells: Cells;
  source: Source;
  active: Coord;
  anchor: Coord;
  colWidths: number[];
  undo: HistoryEntry[];
  redo: HistoryEntry[];
};

type Action =
  | { type: "move"; coord: Coord; extend?: boolean }
  | { type: "select"; active: Coord; anchor: Coord }
  | { type: "write"; changes: Cells; record?: boolean }
  | { type: "resize-col"; col: number; width: number }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; source: Source };

function init(): State {
  return {
    cells: {},
    source: "demo",
    active: { row: 1, col: 0 },
    anchor: { row: 1, col: 0 },
    colWidths: Array.from({ length: COL_COUNT }, (_, i) =>
      i === 1 || i === 7 ? 168 : DEFAULT_COL_WIDTH,
    ),
    undo: [],
    redo: [],
  };
}

function rawAt(state: State, row: number, col: number): string {
  const key = cellKey(row, col);
  if (key in state.cells) return state.cells[key];
  return state.source === "demo" ? demoCell(row, col) : "";
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "move": {
      const coord = clampCoord(action.coord, ROW_COUNT, COL_COUNT);
      return {
        ...state,
        active: coord,
        anchor: action.extend ? state.anchor : coord,
      };
    }
    case "select":
      return { ...state, active: action.active, anchor: action.anchor };
    case "write": {
      const next = { ...state.cells, ...action.changes };
      if (!action.record) return { ...state, cells: next };
      const before: Cells = {};
      const after: Cells = {};
      for (const key of Object.keys(action.changes)) {
        const { row, col } = parseCellKey(key);
        before[key] = rawAt(state, row, col);
        after[key] = action.changes[key];
      }
      return {
        ...state,
        cells: next,
        undo: [...state.undo, { before, after }].slice(-MAX_HISTORY),
        redo: [],
      };
    }
    case "resize-col": {
      const colWidths = [...state.colWidths];
      colWidths[action.col] = Math.max(MIN_COL_WIDTH, action.width);
      return { ...state, colWidths };
    }
    case "undo": {
      const entry = state.undo[state.undo.length - 1];
      if (!entry) return state;
      return {
        ...state,
        cells: { ...state.cells, ...entry.before },
        undo: state.undo.slice(0, -1),
        redo: [...state.redo, entry],
      };
    }
    case "redo": {
      const entry = state.redo[state.redo.length - 1];
      if (!entry) return state;
      return {
        ...state,
        cells: { ...state.cells, ...entry.after },
        redo: state.redo.slice(0, -1),
        undo: [...state.undo, entry],
      };
    }
    case "reset":
      return {
        ...init(),
        source: action.source,
        colWidths: state.colWidths,
      };
    default:
      return state;
  }
}

export function useWorkbook() {
  const [state, dispatch] = useReducer(reducer, undefined, init);

  const cells = state.cells;
  const source = state.source;

  const getRaw = useCallback(
    (row: number, col: number) => {
      const key = cellKey(row, col);
      if (key in cells) return cells[key];
      return source === "demo" ? demoCell(row, col) : "";
    },
    [cells, source],
  );

  const getDisplay = useCallback(
    (row: number, col: number) => {
      const raw = getRaw(row, col);
      if (!raw) return "";
      const result = evaluateRaw(raw, getRaw);
      if (!result.ok) return result.error;
      return formatValue(result.value);
    },
    [getRaw],
  );

  const writeCells = useCallback((changes: Cells, record = true) => {
    dispatch({ type: "write", changes, record });
  }, []);

  const commitActive = useCallback(
    (raw: string) => {
      writeCells({ [cellKey(state.active.row, state.active.col)]: raw });
    },
    [state.active, writeCells],
  );

  const clearSelection = useCallback(() => {
    const { start, end } = normalizeRange(state.active, state.anchor);
    const count = (end.row - start.row + 1) * (end.col - start.col + 1);
    if (count > 15_000) return;
    const changes: Cells = {};
    for (let row = start.row; row <= end.row; row++) {
      for (let col = start.col; col <= end.col; col++) {
        changes[cellKey(row, col)] = "";
      }
    }
    writeCells(changes);
  }, [state.active, state.anchor, writeCells]);

  const copySelection = useCallback(async () => {
    const size = rangeSize(state.active, state.anchor);
    if (size.rows * size.cols > 15_000) return "";
    const tsv = rangeToTsv(state.active, state.anchor, getRaw);
    await navigator.clipboard.writeText(tsv);
    return tsv;
  }, [getRaw, state.active, state.anchor]);

  const pasteTsv = useCallback(
    (text: string) => {
      const grid = parseTsv(text);
      const changes: Cells = {};
      grid.forEach((line, r) => {
        line.forEach((value, c) => {
          const row = state.active.row + r;
          const col = state.active.col + c;
          if (row < ROW_COUNT && col < COL_COUNT) {
            changes[cellKey(row, col)] = value;
          }
        });
      });
      writeCells(changes);
      const last = parseCellKey(
        Object.keys(changes).at(-1) ??
          cellKey(state.active.row, state.active.col),
      );
      dispatch({
        type: "select",
        anchor: state.active,
        active: last,
      });
    },
    [state.active, writeCells],
  );

  const selectionMeta = useMemo(() => {
    const size = rangeSize(state.active, state.anchor);
    const { start, end } = normalizeRange(state.active, state.anchor);
    const tooLarge = size.rows * size.cols > 2_000;
    let sum = 0;
    let numeric = 0;
    if (!tooLarge) {
      for (let row = start.row; row <= end.row; row++) {
        for (let col = start.col; col <= end.col; col++) {
          const raw = getRaw(row, col);
          const result = evaluateRaw(raw, getRaw);
          if (result.ok && typeof result.value === "number") {
            sum += result.value;
            numeric += 1;
          }
        }
      }
    }
    return { size, sum, numeric, tooLarge };
  }, [getRaw, state.active, state.anchor]);

  return {
    ...state,
    rows: ROW_COUNT,
    cols: COL_COUNT,
    getRaw,
    getDisplay,
    selectionMeta,
    inSelection: (coord: Coord) => inRange(coord, state.active, state.anchor),
    moveTo: (coord: Coord, extend = false) =>
      dispatch({ type: "move", coord, extend }),
    select: (active: Coord, anchor: Coord) =>
      dispatch({ type: "select", active, anchor }),
    commitActive,
    writeCells,
    clearSelection,
    copySelection,
    pasteTsv,
    resizeCol: (col: number, width: number) =>
      dispatch({ type: "resize-col", col, width }),
    undo: () => dispatch({ type: "undo" }),
    redo: () => dispatch({ type: "redo" }),
    fillDemo: () => dispatch({ type: "reset", source: "demo" }),
    clearSheet: () => dispatch({ type: "reset", source: "blank" }),
  };
}

export type WorkbookApi = ReturnType<typeof useWorkbook>;
