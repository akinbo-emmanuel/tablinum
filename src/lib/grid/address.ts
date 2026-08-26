export type Coord = { row: number; col: number };

export function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

export function parseCellKey(key: string): Coord {
  const [row, col] = key.split(":").map(Number);
  return { row, col };
}

export function colToLetter(col: number): string {
  let n = col + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export function letterToCol(letters: string): number {
  let n = 0;
  const upper = letters.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    n = n * 26 + (upper.charCodeAt(i) - 64);
  }
  return n - 1;
}

export function toA1(row: number, col: number): string {
  return `${colToLetter(col)}${row + 1}`;
}

const A1 = /^([A-Za-z]+)(\d+)$/;

export function parseA1(ref: string): Coord | null {
  const match = A1.exec(ref.trim());
  if (!match) return null;
  const col = letterToCol(match[1]);
  const row = Number(match[2]) - 1;
  if (row < 0 || col < 0) return null;
  return { row, col };
}

export function clampCoord(
  coord: Coord,
  rows: number,
  cols: number,
): Coord {
  return {
    row: Math.max(0, Math.min(rows - 1, coord.row)),
    col: Math.max(0, Math.min(cols - 1, coord.col)),
  };
}

export function normalizeRange(a: Coord, b: Coord): { start: Coord; end: Coord } {
  return {
    start: { row: Math.min(a.row, b.row), col: Math.min(a.col, b.col) },
    end: { row: Math.max(a.row, b.row), col: Math.max(a.col, b.col) },
  };
}

export function rangeSize(a: Coord, b: Coord): { rows: number; cols: number } {
  const { start, end } = normalizeRange(a, b);
  return { rows: end.row - start.row + 1, cols: end.col - start.col + 1 };
}

export function inRange(coord: Coord, a: Coord, b: Coord): boolean {
  const { start, end } = normalizeRange(a, b);
  return (
    coord.row >= start.row &&
    coord.row <= end.row &&
    coord.col >= start.col &&
    coord.col <= end.col
  );
}
