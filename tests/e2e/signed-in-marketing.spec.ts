import { expect, test } from "@playwright/test";
import { signInUI, uniq } from "./qa/helpers";

const pages = ["/", "/pricing", "/docs"];

test("signed-out marketing pages still show Sign in", async ({ page }) => {
  for (const path of pages) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(path);
    const header = page.getByRole("banner");
    await expect(header.getByRole("link", { name: "Sign in" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Create a form" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Open app" })).toHaveCount(0);
  }
  await page.goto("/pricing");
  await expect(page.getByRole("link", { name: "Start free" })).toBeVisible();
});

test("signed-in visitors get Open app, Sign out and billing CTAs on marketing pages", async ({ page, request }) => {
  await signInUI(page, request, `mk+${uniq()}@studio.test`);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const path of pages) {
    await page.goto(path);
    const header = page.getByRole("banner");
    const open = header.getByRole("link", { name: "Open app" });
    await expect(open).toBeVisible();
    await expect(open).toHaveAttribute("href", "/app");
    await expect(header.getByRole("button", { name: "Sign out" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  }
  await page.goto("/pricing");
  await expect(page.getByRole("link", { name: "Start free" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Choose Pro" })).toHaveAttribute("href", /\/app\/billing\?plan=pro/);

  await page.goto("/");
  await page.getByRole("banner").getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("banner").getByRole("link", { name: "Sign in" })).toBeVisible();
});
