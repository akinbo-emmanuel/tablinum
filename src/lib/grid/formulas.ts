import { COL_COUNT, ROW_COUNT } from "./constants";
import { parseA1, toA1 } from "./address";

export type CellGetter = (row: number, col: number) => string;

export type EvalResult =
  | { ok: true; value: number | string }
  | { ok: false; error: string };

const REF = /^[A-Za-z]+\d+$/;
const RANGE = /^([A-Za-z]+\d+):([A-Za-z]+\d+)$/;

export function isFormula(raw: string): boolean {
  return raw.trimStart().startsWith("=");
}

export function evaluateRaw(
  raw: string,
  get: CellGetter,
  visiting = new Set<string>(),
): EvalResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: "" };
  if (!isFormula(trimmed)) {
    const n = toNumber(trimmed);
    return n === null ? { ok: true, value: trimmed } : { ok: true, value: n };
  }
  return evaluateExpr(trimmed.slice(1), get, visiting);
}

function evaluateExpr(
  expr: string,
  get: CellGetter,
  visiting: Set<string>,
): EvalResult {
  try {
    const tokens = tokenize(expr);
    const parser = new Parser(tokens, get, visiting);
    const value = parser.parseExpr();
    parser.expectEnd();
    return { ok: true, value };
  } catch (err) {
    const message = err instanceof Error ? err.message : "#ERROR!";
    return { ok: false, error: message };
  }
}

function toNumber(text: string): number | null {
  if (text === "") return null;
  const n = Number(text);
  return Number.isFinite(n) && text.trim() !== "" ? n : null;
}

type Token =
  | { kind: "num"; value: number }
  | { kind: "ref"; value: string }
  | { kind: "ident"; value: string }
  | { kind: "op"; value: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" }
  | { kind: "colon" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t") {
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i += 1;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma" });
      i += 1;
      continue;
    }
    if (ch === ":") {
      tokens.push({ kind: "colon" });
      i += 1;
      continue;
    }
    if ("+-*/".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i += 1;
      continue;
    }
    if (ch === "." || (ch >= "0" && ch <= "9")) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j += 1;
      const n = Number(input.slice(i, j));
      if (!Number.isFinite(n)) throw new Error("#NUM!");
      tokens.push({ kind: "num", value: n });
      i = j;
      continue;
    }
    if (/[A-Za-z]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9]/.test(input[j])) j += 1;
      const value = input.slice(i, j);
      tokens.push(REF.test(value) ? { kind: "ref", value } : { kind: "ident", value });
      i = j;
      continue;
    }
    throw new Error("#ERROR!");
  }
  return tokens;
}

class Parser {
  private i = 0;

  constructor(
    private tokens: Token[],
    private get: CellGetter,
    private visiting: Set<string>,
  ) {}

  parseExpr(): number {
    let left = this.parseTerm();
    while (this.matchOp("+") || this.matchOp("-")) {
      const op = this.prevOp();
      const right = this.parseTerm();
      left = op === "+" ? left + right : left - right;
    }
    return left;
  }

  private parseTerm(): number {
    let left = this.parseFactor();
    while (this.matchOp("*") || this.matchOp("/")) {
      const op = this.prevOp();
      const right = this.parseFactor();
      if (op === "/" && right === 0) throw new Error("#DIV/0!");
      left = op === "*" ? left * right : left / right;
    }
    return left;
  }

  private parseFactor(): number {
    if (this.matchOp("+")) return this.parseFactor();
    if (this.matchOp("-")) return -this.parseFactor();
    if (this.match("lparen")) {
      const value = this.parseExpr();
      this.expect("rparen");
      return value;
    }
    const token = this.peek();
    if (!token) throw new Error("#ERROR!");
    if (token.kind === "num") {
      this.i += 1;
      return token.value;
    }
    if (token.kind === "ref") {
      this.i += 1;
      return this.resolveRef(token.value);
    }
    if (token.kind === "ident") {
      this.i += 1;
      return this.parseFn(token.value);
    }
    throw new Error("#ERROR!");
  }

  private parseFn(name: string): number {
    this.expect("lparen");
    const fn = name.toUpperCase();
    if (fn === "SUM") {
      const values = this.parseArgs();
      this.expect("rparen");
      return values.reduce((a, b) => a + b, 0);
    }
    if (fn === "AVG" || fn === "AVERAGE") {
      const values = this.parseArgs();
      this.expect("rparen");
      if (values.length === 0) throw new Error("#DIV/0!");
      return values.reduce((a, b) => a + b, 0) / values.length;
    }
    if (fn === "MIN") {
      const values = this.parseArgs();
      this.expect("rparen");
      if (values.length === 0) throw new Error("#VALUE!");
      return Math.min(...values);
    }
    if (fn === "MAX") {
      const values = this.parseArgs();
      this.expect("rparen");
      if (values.length === 0) throw new Error("#VALUE!");
      return Math.max(...values);
    }
    throw new Error("#NAME?");
  }

  private parseArgs(): number[] {
    const out: number[] = [];
    if (this.peek()?.kind === "rparen") return out;
    out.push(...this.parseArg());
    while (this.match("comma")) {
      out.push(...this.parseArg());
    }
    return out;
  }

  private parseArg(): number[] {
    const token = this.peek();
    const next = this.tokens[this.i + 1];
    if (token?.kind === "ref" && next?.kind === "colon") {
      const startRef = token.value;
      this.i += 2;
      const end = this.peek();
      if (end?.kind !== "ref") throw new Error("#REF!");
      this.i += 1;
      return this.resolveRange(`${startRef}:${end.value}`);
    }
    return [this.parseExpr()];
  }

  private resolveRef(ref: string): number {
    const coord = parseA1(ref);
    if (!coord) throw new Error("#REF!");
    if (coord.row >= ROW_COUNT || coord.col >= COL_COUNT) throw new Error("#REF!");
    const a1 = toA1(coord.row, coord.col);
    if (this.visiting.has(a1)) throw new Error("#CYCLE!");
    this.visiting.add(a1);
    const raw = this.get(coord.row, coord.col);
    const result = evaluateRaw(raw, this.get, this.visiting);
    this.visiting.delete(a1);
    if (!result.ok) throw new Error(result.error);
    if (result.value === "") return 0;
    if (typeof result.value === "number") return result.value;
    const n = toNumber(result.value);
    if (n === null) throw new Error("#VALUE!");
    return n;
  }

  private resolveRange(text: string): number[] {
    const match = RANGE.exec(text);
    if (!match) throw new Error("#REF!");
    const a = parseA1(match[1]);
    const b = parseA1(match[2]);
    if (!a || !b) throw new Error("#REF!");
    const r0 = Math.min(a.row, b.row);
    const r1 = Math.max(a.row, b.row);
    const c0 = Math.min(a.col, b.col);
    const c1 = Math.max(a.col, b.col);
    if (r1 - r0 + 1 > 10_000) throw new Error("#LIMIT!");
    const values: number[] = [];
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        values.push(this.resolveRef(toA1(row, col)));
      }
    }
    return values;
  }

  private match(kind: Token["kind"]): boolean {
    if (this.peek()?.kind === kind) {
      this.i += 1;
      return true;
    }
    return false;
  }

  private matchOp(op: string): boolean {
    const token = this.peek();
    if (token?.kind === "op" && token.value === op) {
      this.i += 1;
      return true;
    }
    return false;
  }

  private prevOp(): string {
    const token = this.tokens[this.i - 1];
    if (token?.kind !== "op") throw new Error("#ERROR!");
    return token.value;
  }

  private expect(kind: Token["kind"]): void {
    if (!this.match(kind)) throw new Error("#ERROR!");
  }

  expectEnd(): void {
    if (this.peek()) throw new Error("#ERROR!");
  }

  private peek(): Token | undefined {
    return this.tokens[this.i];
  }
}

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 4,
  minimumFractionDigits: 0,
});

export function formatValue(value: number | string): string {
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "#NUM!";
  return numberFormat.format(value);
}
