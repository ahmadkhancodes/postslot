import { expect, test } from "@playwright/test";

test("status page shows recorded checks", async ({ page, request }) => {
  await page.goto("/status");
  await expect(page.getByRole("heading", { name: "Status", exact: true })).toBeVisible();
  await expect(page.getByText("No checks recorded yet")).toBeVisible();
  const r = await request.get("/api/cron/uptime-probe", { headers: { authorization: "Bearer e2e-cron" } });
  expect(r.ok()).toBe(true);
  await page.goto("/status");
  await expect(page.getByRole("status").filter({ hasText: /operational|problem/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Last 90 days" })).toBeVisible();
  for (const [w, h, n] of [[375, 800, "375"], [1440, 900, "1440"]] as const) {
    await page.setViewportSize({ width: w, height: h });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `docs/qa/status/status-${n}.png`, fullPage: true });
  }
  expect((await request.get("/api/health")).status()).toBe(200);
});
