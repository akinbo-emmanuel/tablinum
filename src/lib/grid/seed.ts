import { cellKey } from "./address";
import { ROW_COUNT } from "./constants";

const REGIONS = ["Lagos", "Accra", "Nairobi", "Kigali", "London", "Berlin"];
const PRODUCTS = [
  "Obsidian ledger",
  "Vellum binder",
  "Ink stone",
  "Brass stylus",
  "Archive box",
  "Wax seal",
];

const HEADERS = ["SKU", "Product", "Region", "Units", "Price", "Revenue"];

export type Cells = Record<string, string>;

export function demoCell(row: number, col: number): string {
  if (row === 0 && col < HEADERS.length) return HEADERS[col];
  if (row === 0 && col === 7) return "Notes";
  if (row === 1 && col === 7) return "Arrow keys move. Shift+arrows select. Enter edits.";
  if (row === 2 && col === 7) return "⌘/Ctrl+C copies TSV. Paste from Excel/Sheets.";
  if (row === 3 && col === 7) return "⌘/Ctrl+Z undo. ⌘/Ctrl+K command palette.";
  if (row === 4 && col === 7) return "J2 and K2 hold sample aggregate formulas.";
  if (row === 0 && col === 9) return "SUM units (first 200)";
  if (row === 1 && col === 9) return "=SUM(D2:D201)";
  if (row === 0 && col === 10) return "AVG price (first 200)";
  if (row === 1 && col === 10) return "=AVERAGE(E2:E201)";

  if (row >= 1 && row < ROW_COUNT && col <= 5) {
    const product = PRODUCTS[row % PRODUCTS.length];
    const region = REGIONS[row % REGIONS.length];
    const units = ((row * 7) % 240) + 12;
    const price = (((row * 13) % 85) + 15) / 2;
    if (col === 0) return `SKU-${String(row).padStart(5, "0")}`;
    if (col === 1) return product;
    if (col === 2) return region;
    if (col === 3) return String(units);
    if (col === 4) return price.toFixed(2);
    if (col === 5) {
      return row <= 200 ? `=D${row + 1}*E${row + 1}` : (units * price).toFixed(2);
    }
  }
  return "";
}

export function seedEdits(): Cells {
  return {
    [cellKey(1, 7)]: demoCell(1, 7),
  };
}
