import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[role="gridcell"][aria-rowindex="2"][aria-colindex="1"]')).toHaveText("SKU-00001");
});

test("moves and expands the active selection from the keyboard", async ({ page }) => {
  const grid = page.getByRole("grid");

  await grid.focus();
  await grid.press("ArrowRight");
  await expect(grid).toHaveAttribute("aria-label", /active cell B2/);

  await grid.press("Shift+ArrowRight");
  await expect(page.getByText("1 × 2 selected")).toBeVisible();
});

test.describe("on non-Apple platforms", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/134.0 Safari/537.36",
  });

  test("shows Ctrl shortcuts", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Ctrl+K" })).toBeVisible();
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Keyboard map" })).toContainText("Ctrl+C / V / X");
  });
});

test("edits and calculates a formula in a cell", async ({ page }) => {
  const grid = page.getByRole("grid");
  const formulaBar = page.getByRole("textbox", { name: "Formula bar" });

  await grid.focus();
  await formulaBar.click();
  await formulaBar.fill("=2*21");
  await formulaBar.press("Enter");

  await grid.focus();
  await grid.press("ArrowUp");
  await expect(formulaBar).toHaveValue("=2*21");
  await expect(page.locator('[role="gridcell"][aria-rowindex="2"][aria-colindex="1"]')).toHaveText("42");
});

test("undoes and redoes an edit", async ({ page }) => {
  const grid = page.getByRole("grid");
  const formulaBar = page.getByRole("textbox", { name: "Formula bar" });

  await grid.focus();
  await formulaBar.click();
  await formulaBar.fill("revised SKU");
  await formulaBar.press("Enter");

  await grid.focus();
  await grid.press("ControlOrMeta+z");
  await grid.press("ArrowUp");
  await expect(formulaBar).toHaveValue("SKU-00001");

  await grid.focus();
  await grid.press("ControlOrMeta+Shift+z");
  await expect(formulaBar).toHaveValue("revised SKU");
});
