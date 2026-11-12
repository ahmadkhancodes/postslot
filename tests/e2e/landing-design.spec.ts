import { expect, test, type Page } from "@playwright/test";

// Landing page design library compliance (skill B1, B5, B10, B11), measured in the browser.

const SCALE = [12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72, 96, 128];

async function wordOpacities(page: Page) {
  return page.locator(".kit-word").evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).opacity)));
}

for (const width of [1440, 390]) {
  test(`hero, type scale and overflow at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const h1 = page.locator("h1");
    await expect(h1).toHaveText("Every form submission, delivered with a receipt");
    expect((await h1.boundingBox())!.width).toBeLessThanOrEqual(680);
    const sub = page.locator("#hero-title + p");
    expect((await sub.boundingBox())!.width).toBeLessThanOrEqual(680);
    // One action above the fold.
    await expect(page.locator("section[aria-labelledby=hero-title] a")).toHaveCount(2); // the CTA and the comparison link in the proof line
    await expect(page.locator("section[aria-labelledby=hero-title]").getByRole("link", { name: "Create a form" })).toBeVisible();
    await expect(page.locator("#final-cta-title ~ div").getByRole("link", { name: "Create a form" })).toBeVisible();

    const bad = await page.evaluate((scale) => {
      const out: string[] = [];
      for (const e of document.querySelectorAll("body *")) {
        const hasText = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim());
        if (!hasText) continue;
        const cs = getComputedStyle(e);
        if (cs.display === "none") continue;
        if (!scale.includes(parseFloat(cs.fontSize)) || Number(cs.fontWeight) > 700 || cs.fontStyle !== "normal") out.push(`${e.tagName} ${cs.fontSize} ${cs.fontWeight} ${cs.fontStyle}`);
      }
      return out;
    }, SCALE);
    expect(bad).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
}

test("tagline words light up one by one, in reading order, on scroll", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  const before = await wordOpacities(page);
  expect(before.length).toBeGreaterThan(10);
  expect(before.every((o) => o >= 0.25 && o <= 0.35)).toBe(true);

  const tagline = page.locator(".kit-word").first().locator("xpath=..");
  // Bring the first line just over the trigger line (60% of the viewport): only a prefix of the words may be lit.
  await tagline.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.5));
  await page.waitForTimeout(250);
  const mid = await wordOpacities(page);
  const lit = mid.map((o) => o > 0.35);
  const firstUnlit = lit.indexOf(false);
  expect(lit[0]).toBe(true);
  expect(firstUnlit).toBeGreaterThan(0);
  expect(lit.slice(firstUnlit).every((x) => !x)).toBe(true);

  await tagline.evaluate((el) => window.scrollTo(0, el.getBoundingClientRect().bottom + window.scrollY - window.innerHeight * 0.3));
  await expect.poll(async () => (await wordOpacities(page)).every((o) => o === 1), { timeout: 10_000 }).toBe(true);
});

test("tagline shows full ink at once under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect((await wordOpacities(page)).every((o) => o === 1)).toBe(true);
});

test("mobile menu is a full height panel with staggered links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Open menu" }).click();
  const panel = page.locator("#mobile-menu");
  const box = (await panel.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(844);
  const delays = await panel.locator("a").evaluateAll((els) => els.map((e) => parseFloat(getComputedStyle(e).transitionDelay) * 1000));
  delays.forEach((d, i) => expect(d).toBe(Math.min(i * 60, 400)));
});
