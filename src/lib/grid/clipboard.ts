import { normalizeRange, type Coord } from "./address";

export function rangeToTsv(
  a: Coord,
  b: Coord,
  getRaw: (row: number, col: number) => string,
): string {
  const { start, end } = normalizeRange(a, b);
  const lines: string[] = [];
  for (let row = start.row; row <= end.row; row++) {
    const cells: string[] = [];
    for (let col = start.col; col <= end.col; col++) {
      cells.push(escapeTsv(getRaw(row, col)));
    }
    lines.push(cells.join("\t"));
  }
  return lines.join("\n");
}

export function parseTsv(text: string): string[][] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n")
    : normalized.split("\n");
  return lines.map((line) => line.split("\t"));
}

function escapeTsv(value: string): string {
  if (value.includes("\t") || value.includes("\n") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
