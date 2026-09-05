import { expect, test, type Page } from "@playwright/test";

const cell = (page: Page, row: number, col: number) =>
  page.locator(`[role="gridcell"][aria-rowindex="${row}"][aria-colindex="${col}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  // The shell is server-rendered. Wait for the interactive grid to mount.
  await expect(cell(page, 2, 1)).toHaveText("SKU-00001");
});

test("cells, headers and selection move together before scroll handlers run", async ({ page }) => {
  const grid = page.getByRole("grid");
  await grid.press("ArrowRight");
  const errors = await grid.evaluate((el) => {
    const target = el.querySelector('[role="gridcell"][aria-rowindex="2"][aria-colindex="2"]')!;
    const row = el.querySelector('[role="rowheader"][aria-rowindex="2"]')!;
    const column = el.querySelector('[role="columnheader"][aria-colindex="2"]')!;
    const selection = el.querySelector('[data-testid="active-cell"]')!;
    const before = target.getBoundingClientRect();
    const top = el.getBoundingClientRect().top;
    // Read layout in the same task: synchronizing overlays in a later scroll
    // event is too late and produces visible tearing under main-thread load.
    el.scrollTop = 13;
    el.scrollLeft = 73;
    const after = target.getBoundingClientRect();
    const active = selection.getBoundingClientRect();
    return [
      after.x - (before.x - el.scrollLeft),
      after.y - (before.y - el.scrollTop),
      row.getBoundingClientRect().y - after.y,
      row.getBoundingClientRect().x - el.getBoundingClientRect().x,
      column.getBoundingClientRect().x - after.x,
      column.getBoundingClientRect().y - top,
      active.x - after.x,
      active.y - after.y,
    ];
  });
  for (const error of errors) expect(Math.abs(error)).toBeLessThan(1);
});

test("stays aligned through diagonal wheel scrolling and direction changes", async ({ page }) => {
  const grid = page.getByRole("grid");
  const box = (await grid.boundingBox())!;
  await page.mouse.move(box.x + 400, box.y + 250);
  for (const [x, y] of [[380, 705], [500, 2340], [-230, -910], [-400, 301]]) {
    const previous = await grid.evaluate((el) => el.scrollTop);
    await page.mouse.wheel(x, y);
    await expect.poll(() => grid.evaluate((el) => el.scrollTop)).not.toBe(previous);
    await expect.poll(() => grid.evaluate((el) => {
      const row = Math.floor(el.scrollTop / 28) + 2;
      const header = el.querySelector(`[role="rowheader"][aria-rowindex="${row}"]`);
      const cells = el.querySelectorAll(`[role="gridcell"][aria-rowindex="${row}"]`);
      if (!header || cells.length !== 26) return false;
      return [...cells].every((cell) => {
        const col = el.querySelector(`[role="columnheader"][aria-colindex="${cell.getAttribute("aria-colindex")}"]`)!;
        return Math.abs(cell.getBoundingClientRect().x - col.getBoundingClientRect().x) < 1 &&
          Math.abs(cell.getBoundingClientRect().y - header.getBoundingClientRect().y) < 1;
      });
    })).toBe(true);
  }
});

test("recycles rows at large scroll jumps and reaches both sheet boundaries", async ({ page }) => {
  const grid = page.getByRole("grid");
  for (const top of [280000, 900001, 1399000, 2800, 0]) {
    await grid.evaluate((el, y) => { el.scrollTop = y; }, top);
    const row = Math.floor(top / 28) + 2;
    await expect(cell(page, row, 1)).toHaveText(`SKU-${String(row - 1).padStart(5, "0")}`);
    expect(await grid.getByRole("gridcell").count()).toBeLessThan(5000);
  }
  await grid.press("ControlOrMeta+End");
  await expect(grid).toHaveAttribute("aria-label", "Spreadsheet, active cell Z50000");
  await expect(cell(page, 50000, 26)).toBeInViewport();
  await expect(grid.getByRole("rowheader", { name: "50000", exact: true })).toBeInViewport();
  await grid.press("ControlOrMeta+Home");
  await expect(cell(page, 1, 1)).toBeInViewport();
  expect(await grid.evaluate((el) => [el.scrollLeft, el.scrollTop])).toEqual([0, 0]);
});

test("frozen headers cover cells and do not select hidden cells", async ({ page }) => {
  const grid = page.getByRole("grid");
  await grid.evaluate((el) => { el.scrollLeft = 387; el.scrollTop = 1403; });
  await expect(cell(page, 52, 4)).toBeAttached();
  const box = (await grid.boundingBox())!;
  for (const [x, y, role] of [[90, 15, "columnheader"], [20, 65, "rowheader"]] as const) {
    const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute("role"), { x: box.x + x, y: box.y + y });
    expect(hit).toBe(role);
    await page.mouse.click(box.x + x, box.y + y);
    await expect(grid).toHaveAttribute("aria-label", "Spreadsheet, active cell A2");
  }
  // Corner must be opaque and stay above both scrolling header tracks.
  await page.mouse.click(box.x + 20, box.y + 15);
  await expect(grid).toHaveAttribute("aria-label", "Spreadsheet, active cell A2");
  await page.mouse.click(box.x + 90, box.y + 80);
  await expect(grid).toHaveAttribute("aria-label", "Spreadsheet, active cell D52");
  await expect(page.getByRole("textbox", { name: "Formula bar" })).toHaveValue("129");
});

test("resizing a scrolled column preserves the viewport and cell alignment", async ({ page }) => {
  const grid = page.getByRole("grid");
  await grid.evaluate((el) => { el.scrollLeft = 400; el.scrollTop = 2800; });
  await expect(cell(page, 102, 4)).toBeAttached();
  const handle = page.getByRole("separator", { name: "Resize column E", exact: true });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 65, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  expect(await grid.evaluate((el) => [el.scrollLeft, el.scrollTop])).toEqual([400, 2800]);
  const header = await grid.locator('[role="columnheader"][aria-colindex="5"]').boundingBox();
  const target = await cell(page, 102, 5).boundingBox();
  expect(target!.width).toBe(185);
  expect(target!.x).toBe(header!.x);
  expect(target!.width).toBe(header!.width);
  await page.setViewportSize({ width: 900, height: 600 });
  expect(await grid.evaluate((el) => [el.scrollLeft, el.scrollTop])).toEqual([400, 2800]);
});

test("editor scrolls with its cell and stays behind frozen headers", async ({ page }) => {
  const grid = page.getByRole("grid");
  await grid.press("F2");
  const editor = page.getByRole("textbox", { name: "Edit A2", exact: true });
  await expect(editor).toBeFocused();
  await grid.evaluate((el) => { el.scrollTop = 45; el.scrollLeft = 60; });
  const box = (await grid.boundingBox())!;
  const headerHit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest("input") !== null, { x: box.x + 80, y: box.y + 20 });
  expect(headerHit).toBe(false);
  const rect = (await editor.boundingBox())!;
  expect(rect.x).toBe(box.x + 56 - 60);
  expect(rect.y).toBe(box.y + 32 + 28 - 45);
});

test("fast scroll jumps have content and grid lines at the next animation frame", async ({ page }) => {
  const missing = await page.getByRole("grid").evaluate(async (el) => {
    const missing: number[] = [];
    for (const top of [30000, 120000, 560000, 1399000, 400000, 28000, 0]) {
      el.scrollTop = top;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const first = Math.floor(el.scrollTop / 28) + 2;
      const last = Math.min(50000, Math.floor((el.scrollTop + el.clientHeight - 32) / 28));
      for (let row = first; row <= last; row++) {
        const cell = el.querySelector<HTMLElement>(`[role="gridcell"][aria-rowindex="${row}"][aria-colindex="1"]`);
        if (!cell?.textContent || getComputedStyle(cell).borderBottomWidth !== "1px") missing.push(row);
      }
    }
    return missing;
  });
  expect(missing).toEqual([]);
});

test("scrolling retains overlapping rows without rewriting their contents", async ({ page }) => {
  const result = await page.getByRole("grid").evaluate(async (el) => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    el.scrollTop = 2800;
    await frame();
    const selector = '[role="gridcell"][aria-rowindex="120"][aria-colindex="1"]';
    const original = el.querySelector(selector)!;
    let mutations = 0;
    const observer = new MutationObserver((records) => { mutations += records.length; });
    observer.observe(original.parentElement!, { subtree: true, attributes: true, childList: true, characterData: true });
    el.scrollTop += 1120;
    await frame();
    mutations += observer.takeRecords().length;
    observer.disconnect();
    return { retained: el.querySelector(selector) === original, mutations };
  });
  expect(result).toEqual({ retained: true, mutations: 0 });
});
