"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { parseA1, toA1 } from "@/lib/grid/address";
import { formatValue } from "@/lib/grid/formulas";
import { useWorkbook } from "@/hooks/useWorkbook";
import { useShortcutModifier } from "@/hooks/useShortcutModifier";
import { DataGrid } from "@/components/grid/DataGrid";
import { CommandPalette, type Command } from "@/components/shell/CommandPalette";

type Theme = "day" | "night";

function readTheme(): Theme {
  return window.localStorage.getItem("tablinum-theme") === "night"
    ? "night"
    : "day";
}

function subscribeTheme(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("tablinum-theme", onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("tablinum-theme", onStoreChange);
  };
}

function writeTheme(next: Theme) {
  window.localStorage.setItem("tablinum-theme", next);
  document.documentElement.dataset.theme = next;
  window.dispatchEvent(new Event("tablinum-theme"));
}

export function Workbook() {
  const book = useWorkbook();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [palette, setPalette] = useState(false);
  const [query, setQuery] = useState("");
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "day");
  const [help, setHelp] = useState(false);
  const shortcutModifier = useShortcutModifier();
  const shortcut = shortcutModifier === "⌘" ? "⌘" : "Ctrl+";

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const beginEdit = (replace: boolean) => {
    setEditing(true);
    setDraft(replace ? "" : book.getRaw(book.active.row, book.active.col));
  };

  const commitEdit = (move?: { row: number; col: number }) => {
    book.commitActive(draft);
    setEditing(false);
    if (move) {
      book.moveTo({
        row: book.active.row + move.row,
        col: book.active.col + move.col,
      });
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(book.getRaw(book.active.row, book.active.col));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette((v) => !v);
        setQuery("");
      }
      if (event.key === "?" && !editing && !meta) {
        const t = event.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
        setHelp((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing]);

  const commands: Command[] = [
    {
      id: "theme",
      label: theme === "day" ? "Switch to night" : "Switch to day",
      hint: "Theme",
      run: () => {
        writeTheme(theme === "day" ? "night" : "day");
        setPalette(false);
      },
    },
    {
      id: "fill",
      label: "Reload 50,000-row demo ledger",
      run: () => {
        book.fillDemo();
        setPalette(false);
      },
    },
    {
      id: "clear",
      label: "Clear sheet",
      run: () => {
        book.clearSheet();
        setPalette(false);
      },
    },
    {
      id: "formula",
      label: "Edit active cell",
      hint: "Enter",
      run: () => {
        setPalette(false);
        beginEdit(false);
      },
    },
    {
      id: "help",
      label: "Keyboard map",
      hint: "?",
      run: () => {
        setHelp(true);
        setPalette(false);
      },
    },
  ];

  const paletteCommands: Command[] = parseA1(query)
    ? [
        {
          id: "goto",
          label: `Go to ${query.toUpperCase()}`,
          run: () => {
            const coord = parseA1(query);
            if (coord) book.moveTo(coord);
            setPalette(false);
          },
        },
        ...commands,
      ]
    : commands;

  const { size, sum, numeric, tooLarge } = book.selectionMeta;
  const a1 = toA1(book.active.row, book.active.col);

  return (
    <div className="flex h-dvh flex-col bg-[var(--paper)] text-[var(--ink)]">
      <header className="flex items-center gap-4 border-b border-[var(--line)] px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <span className="font-[family-name:var(--font-newsreader)] text-xl tracking-tight">
            Tablinum
          </span>
          <span className="hidden text-[11px] uppercase tracking-[0.18em] text-[var(--muted)] sm:inline">
            Records office
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-[12px] text-[var(--muted)]">
          <span className="hidden md:inline">
            {book.rows.toLocaleString()} × {book.cols} · virtualized
          </span>
          <button
            type="button"
            className="rounded border border-[var(--line)] px-2 py-1 hover:bg-[var(--select)]"
            onClick={() => setPalette(true)}
          >
            {shortcut}K
          </button>
          <button
            type="button"
            className="rounded border border-[var(--line)] px-2 py-1 hover:bg-[var(--select)]"
            onClick={() => writeTheme(theme === "day" ? "night" : "day")}
          >
            {theme === "day" ? "Night" : "Day"}
          </button>
        </div>
      </header>

      <div className="flex items-center gap-2 border-b border-[var(--line)] px-3 py-1.5">
        <label className="w-16 shrink-0 text-center font-mono text-xs text-[var(--muted)]">
          {a1}
        </label>
        <span className="text-[var(--muted)]">fx</span>
        <input
          aria-label="Formula bar"
          className="min-w-0 flex-1 bg-transparent font-mono text-[13px] outline-none"
          value={editing ? draft : book.getRaw(book.active.row, book.active.col)}
          onFocus={() => beginEdit(false)}
          onChange={(e) => {
            setEditing(true);
            setDraft(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitEdit({ row: 1, col: 0 });
            }
            if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
            }
          }}
        />
      </div>

      <main className="min-h-0 flex-1">
        <DataGrid
          book={book}
          editing={editing}
          draft={draft}
          onDraftChange={setDraft}
          onBeginEdit={beginEdit}
          onCommitEdit={commitEdit}
          onCancelEdit={cancelEdit}
        />
      </main>

      <footer className="flex items-center gap-4 border-t border-[var(--line)] px-3 py-1 text-[11px] text-[var(--muted)]">
        <span>
          {size.rows} × {size.cols} selected
        </span>
        <span>
          {tooLarge
            ? "Sum skipped on large ranges"
            : numeric
              ? `Sum ${formatValue(sum)} · ${numeric} numbers`
              : "No numeric cells"}
        </span>
        <span className="ml-auto hidden sm:inline">
          Enter edit · Shift+arrows select · {shortcut}C TSV · ? help
        </span>
      </footer>

      <CommandPalette
        open={palette}
        query={query}
        onQuery={setQuery}
        onClose={() => setPalette(false)}
        commands={paletteCommands}
      />

      {help ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--ink)]/30"
            aria-label="Close help"
            onClick={() => setHelp(false)}
          />
          <div
            role="dialog"
            aria-label="Keyboard map"
            className="relative max-w-md rounded-lg border border-[var(--line)] bg-[var(--paper)] p-5 shadow-2xl"
          >
            <h2 className="font-[family-name:var(--font-newsreader)] text-lg">Keyboard</h2>
            <ul className="mt-3 space-y-1.5 font-mono text-[12px] text-[var(--muted)]">
              <li>Arrows — move · Shift+arrows — expand range</li>
              <li>Enter / F2 — edit · Esc — cancel</li>
              <li>Tab — next column · Delete — clear</li>
              <li>{shortcut}C / V / X — copy, paste TSV, cut</li>
              <li>{shortcut}Z — undo · Shift+{shortcut}Z — redo</li>
              <li>{shortcut}K — command palette · type A1 to jump</li>
            </ul>
            <p className="mt-4 text-[12px] leading-5 text-[var(--ink)]">
              Formulas: <code>=D2*E2</code>, <code>=SUM(D2:D201)</code>,{" "}
              <code>AVERAGE</code>, <code>MIN</code>, <code>MAX</code>. First 200
              revenue cells are live formulas.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
