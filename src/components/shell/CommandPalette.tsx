"use client";

import { useEffect, useMemo, useRef } from "react";

export type Command = {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
};

type Props = {
  open: boolean;
  query: string;
  onQuery: (value: string) => void;
  onClose: () => void;
  commands: Command[];
};

export function CommandPalette({ open, query, onQuery, onClose, commands }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) || c.id.toLowerCase().includes(q),
    );
  }, [commands, query]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh] px-4">
      <button
        type="button"
        className="absolute inset-0 bg-[var(--ink)]/30"
        aria-label="Close command palette"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-label="Command palette"
        className="relative w-full max-w-lg overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--paper)] shadow-2xl"
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Jump, toggle, fill…"
          className="w-full border-b border-[var(--line)] bg-transparent px-4 py-3 font-sans text-sm outline-none placeholder:text-[var(--muted)]"
          onKeyDown={(e) => {
            if (e.key === "Escape") onClose();
            if (e.key === "Enter" && filtered[0]) {
              e.preventDefault();
              filtered[0].run();
            }
          }}
        />
        <ul className="max-h-72 overflow-auto py-1">
          {filtered.length === 0 ? (
            <li className="px-4 py-3 text-sm text-[var(--muted)]">No matches</li>
          ) : (
            filtered.map((command) => (
              <li key={command.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-[var(--select)]"
                  onClick={command.run}
                >
                  <span>{command.label}</span>
                  {command.hint ? (
                    <kbd className="text-[11px] text-[var(--muted)]">{command.hint}</kbd>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
