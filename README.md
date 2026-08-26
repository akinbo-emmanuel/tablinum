# Tablinum

A keyboard-first spreadsheet for a senior frontend portfolio. The product is a **records office**: 50,000 virtualized rows, range selection, Excel-style TSV clipboard, undo, a small formula engine, and `role="grid"` semantics.

*Tablinum* was the records room in a Roman house. The name is unused as a software product.

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Idea

Hiring managers already see Next.js dashboards. They do not see whether you can own **interaction**, **rendering cost**, and **accessibility** at once.

Tablinum is that proof. It is not a Twitter clone, not a gold-trading admin, and not a wrapper around Handsontable. The grid, selection model, virtualization, clipboard, and formulas are application code.

**What “done” looks like for a reviewer**

- A live URL they can use with the keyboard only for 30+ seconds
- A repo they can read in 10 minutes (this file, then `src/lib/grid` and `DataGrid`)
- A short case study: constraints, tradeoffs, numbers (row count, what is *not* in the DOM)

---

## Goals and non-goals

**Goals**

- Feel like a product (named, themed, empty/error/formula states), not a widget demo
- 50k rows that scroll without mounting 50k DOM nodes
- Selection, edit, undo, and TSV round-trip that match Excel/Sheets enough to be convincing
- Formulas that are real (parser, cycles, `#DIV/0!`) rather than `eval`
- Accessibility as structure (`grid` / `gridcell`, labels, keyboard map), not only contrast
- Guardrails you would ship: refuse huge copy, skip huge selection aggregates

**Non-goals (on purpose)**

- Multiplayer / CRDTs
- A backend or auth
- Excel parity (pivot, charts, 400 functions)
- A design-system monorepo on day one

Those belong later, if the flagship already stands on its own.

---

## Plan

### Phase 0 — shipped (you are here)

The app is a usable workbook:

| Capability | Status |
| --- | --- |
| Windowed rows and columns (overscan) | Done |
| Click, drag, Shift+click range; arrows / Tab / Home / End | Done |
| In-cell edit and formula bar | Done |
| Sparse overlay on a generated 50k-row demo ledger | Done |
| Formulas: `+ - * /`, `SUM`, `AVERAGE`, `MIN`, `MAX`, ranges, `#CYCLE!` | Done |
| TSV copy/paste; undo/redo | Done |
| Column resize; ⌘K palette (theme, jump to A1, reload, clear); day/night | Done |
| `role="grid"` + status bar (selection size, numeric sum) | Done |

**Stack:** Next.js App Router, React 19, TypeScript, Tailwind v4, pnpm. No grid library.

### Phase 1 — make it reviewable (next)

This is the documentation-and-proof layer. Reviewers believe what they can **run** and **read**.

1. **This README** as the case study (idea, plan, architecture, demo script) — in progress here
2. **Playwright** for two or three keyboard paths (move, range, edit commit, paste TSV)
3. **Deploy** (Vercel) so the portfolio is a URL, not a local `pnpm dev`
4. **In-app “Case” strip or `/case` page** — one screen of constraints and tradeoffs, linked from the header

### Phase 2 — senior texture

Work that changes how the grid *feels* under load and under a screen reader:

- Frozen first column / header that does not fight virtualization
- Fill handle and Cmd+D fill-down
- Recalc graph (dependents) instead of evaluate-on-read for every visible formula
- Storybook for the grid primitive in isolation
- Visual + axe checks in CI

### Phase 3 — only if the story needs it

- Multiple sheets
- CSV import
- Plugin-style custom functions
- Extract `@tablinum/grid` as a package

Do not start Phase 3 until Phase 1 is public.

---

## Architecture

```
src/
  app/                    shell, fonts, theme tokens
  components/
    grid/DataGrid.tsx     window, pointer, keyboard, ARIA
    shell/CommandPalette.tsx
    workbook/Workbook.tsx product chrome
  hooks/useWorkbook.ts    selection, history, overlay cells
  lib/grid/
    address.ts            A1, ranges
    formulas.ts           tokenizer + recursive-descent parser
    clipboard.ts          TSV
    seed.ts               demo ledger as a function of (row, col)
    constants.ts          50_000 × 26, row height, overscan
```

**Virtualization.** The scroller’s inner size is `rows × rowHeight` by `sum(colWidths)`. Only the visible window plus overscan is mounted. Row and column headers follow `scrollTop` / `scrollLeft` so 50k labels never exist as nodes.

**Data.** The 50k ledger is **not** stored as 300k strings. `demoCell(row, col)` is the source of truth; `cells` is a sparse overlay of edits (including explicit clears). Reset to demo drops the overlay.

**Formulas.** Evaluate-on-read with a visiting set for cycles. Range `SUM` is capped (`#LIMIT!` above 10k cells). Cheap and honest for a v1; a dependency graph is Phase 2.

**Guardrails.** Copy no-ops above 15k cells; selection sum skips above 2k cells. Same class of limits as a production grid.

---

## Demo script (90 seconds, keyboard-first)

1. Arrows; Shift+arrows. Status bar shows range size and numeric sum.
2. ⌘K, type `J2`, Enter — live `SUM(D2:D201)`.
3. Edit `F2` (`=D2*E2`); change D2; revenue updates.
4. Copy a small range; paste into Sheets/Excel; paste TSV back.
5. Scroll toward row 40,000. Inspect the DOM: a window of cells, not 50k rows.
6. `?` for the keyboard map. Toggle night/day.

---

## Tradeoffs worth saying in an interview

- **Custom virtualization vs TanStack Virtual** — fewer dependencies, the windowing *is* the portfolio; the cost is we own sticky-header edge cases.
- **Evaluate-on-read vs calc graph** — simpler, fine for visible cells; a `SUM` of 10k cells on screen would be the wrong API, so we cap it.
- **Generated seed vs storing 50k rows** — instant first paint and small memory; edits are overlays, so “clear sheet” is a source flag, not a 50k delete.

---

## What is not in this README yet

Metrics from a production deploy (INP, axe score, Playwright green). Those land with Phase 1 deploy + tests, then get pasted here as numbers, not claims.
