# Tablinum

Tablinum is a keyboard-first spreadsheet for large tabular work. It renders **50,000 rows × 26 columns** with windowed (virtualized) DOM, range selection, in-cell editing, undo, a formula engine, and Excel-compatible TSV copy and paste.

The name refers to the records room of a Roman house.

**Stack:** Next.js (App Router), React 19, TypeScript, Tailwind CSS v4, pnpm. The grid, selection model, virtualization, clipboard, and formulas are implemented in this repository—not via a third-party data-grid library.

## Features

- Windowed rows with overscan across 26 columns; cells and frozen headers share native scrolling
- Pointer and keyboard selection (arrows, Shift+arrows, Tab, Home, End, click-drag)
- Formula bar and in-cell edit (Enter, F2, type-to-replace)
- Formulas: arithmetic, `SUM`, `AVERAGE`, `MIN`, `MAX`, ranges, cycle detection (`#CYCLE!`), `#DIV/0!`
- TSV clipboard for round-trip with Excel and Google Sheets
- Undo / redo, column resize, command palette (⌘K), day and night themes
- `role="grid"` / `gridcell`, labelled formula bar, keyboard map (`?`)
- Status bar: selection size and numeric aggregate (capped on very large ranges)
- Copy refused above 15,000 cells; aggregates skipped above 2,000 cells

The demo ledger is generated from `(row, col)` rather than stored as hundreds of thousands of strings. Edits live in a sparse overlay.

## Getting started

```bash
pnpm install
pnpm exec playwright install chromium firefox webkit
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

| Command | Description |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` | Production build |
| `pnpm lint` | ESLint |
| `pnpm test:e2e` | Playwright keyboard-flow tests |

## Architecture

```
src/
  app/                         App Router, fonts, theme tokens
  components/
    grid/DataGrid.tsx          Virtualization, pointer, keyboard, ARIA
    shell/CommandPalette.tsx
    workbook/Workbook.tsx      Application chrome
  hooks/useWorkbook.ts         Selection, history, cell overlay
  lib/grid/
    address.ts                 A1 notation and ranges
    formulas.ts                Tokenizer and recursive-descent parser
    clipboard.ts               TSV encode / decode
    seed.ts                    Demo ledger as a function of (row, col)
    constants.ts               Grid size, row height, overscan
```

**Virtualization.** The scroll surface is sized to `rows × rowHeight` by the sum of column widths. A bounded pool of rows (plus overscan) renders all 26 columns. Cells, row numbers, selection, and the editor use sheet coordinates inside the same native scroll surface; sticky headers freeze the top and left edges. JavaScript recycles only rows entering the buffer, retaining overlapping DOM subtrees. Each row is a small, contained paint surface with its own grid lines, avoiding a sheet-sized painted background. Number formatting reuses one formatter rather than creating one per cell.

**Data.** `demoCell(row, col)` supplies the default ledger. `cells` stores edits and explicit clears. Restoring the demo drops the overlay.

**Formulas.** Values are computed on read. A visiting set detects cycles. Range evaluation is limited (`#LIMIT!` above 10,000 cells). A dependency graph for incremental recalc is planned, not implemented.

## Design decisions

| Choice | Rationale |
| --- | --- |
| Custom windowing instead of a virtualization library | The rendering model is a first-class part of the project; sticky headers and the selection layer stay in one place. |
| Evaluate-on-read instead of a calc graph | Sufficient for the visible window; large `SUM` ranges are capped rather than allowed to block the UI. |
| Generated seed instead of materializing 50,000 rows | Fast first paint and low memory; “clear sheet” switches source rather than deleting a large map. |

## Keyboard

| Action | Shortcut |
| --- | --- |
| Move | Arrow keys |
| Expand selection | Shift + arrows |
| Edit | Enter or F2 |
| Commit and move down | Enter (in edit) |
| Cancel edit | Escape |
| Next / previous column | Tab / Shift+Tab |
| Clear selection | Delete or Backspace |
| Copy / cut / paste TSV | ⌘/Ctrl + C / X / V |
| Undo / redo | ⌘/Ctrl + Z / Shift+⌘Z |
| Command palette | ⌘/Ctrl + K (type an A1 address to jump) |
| Keyboard map | `?` |

## Roadmap

**Current.** Interactive workbook as described above.

**Next.** Automated keyboard tests (Playwright), production deploy, in-product case notes (`/case`) covering constraints and the table in Design decisions.

**Later.** Frozen columns that remain correct under virtualization, fill handle, incremental recalc, Storybook for the grid primitive, axe and visual checks in CI.

**Out of scope for this version.** Collaboration, backend and auth, Excel-complete function coverage, multiple sheets, CSV import, a published `@tablinum/grid` package.

## License

[MIT](./LICENSE)

## Contributing

Development follows GitHub flow (feature branches, pull requests, tagged releases). See [CONTRIBUTING.md](./CONTRIBUTING.md).
