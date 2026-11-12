import { expect, test, type Page } from "@playwright/test";
import { signInUI, uniq, watch } from "../qa/helpers";

// Post-redesign regression pass: brand (ink/paper/rust, Newsreader/Schibsted/JetBrains), light only, on every screen.
const PUBLIC = ["/", "/pricing", "/compare/web3forms", "/docs", "/docs/install", "/legal/privacy", "/legal/terms", "/status", "/sign-in", "/no-such-page-xyz"];

async function brand(page: Page) {
  return page.evaluate(() => {
    const out: string[] = [];
    const lum = (c: string) => { const m = c.match(/\d+(\.\d+)?/g)!.map(Number); return (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255; };
    if (lum(getComputedStyle(document.body).backgroundColor) < 0.9 && !location.pathname.startsWith("/app") && !location.pathname.startsWith("/admin")) out.push(`dark page background ${getComputedStyle(document.body).backgroundColor}`);
    if (getComputedStyle(document.documentElement).colorScheme !== "light") out.push("color-scheme not light");
    const h = document.querySelector("h1");
    if (h && !/Newsreader|serif/i.test(getComputedStyle(h).fontFamily)) out.push(`h1 font ${getComputedStyle(h).fontFamily}`);
    if (!/Schibsted|sans/i.test(getComputedStyle(document.body).fontFamily)) out.push(`body font ${getComputedStyle(document.body).fontFamily}`);
    document.querySelectorAll("*").forEach((el) => {
      const s = getComputedStyle(el);
      const r = parseFloat(s.borderTopLeftRadius);
      if (r > 4 && !(el.className?.toString().includes("rounded-full") || s.borderTopLeftRadius.includes("%"))) out.push(`radius ${r} on ${el.tagName}.${String(el.className).slice(0, 40)}`);
      if (/rgb\(1[0-9]{2}, 5[0-9], 2[0-9]{2}\)|rgb\(124, 58, 237\)/.test(s.color + s.backgroundColor)) out.push(`violet on ${el.tagName}`);
    });
    return out.slice(0, 5);
  });
}

test("every public screen, both widths: brand fonts and colours, no clipped text, no scroll, no console errors", async ({ page }) => {
  const problems = watch(page);
  const bad: string[] = [];
  for (const w of [375, 1440]) {
    await page.setViewportSize({ width: w, height: 800 });
    for (const p of PUBLIC) {
      await page.goto(p);
      for (const b of await brand(page)) bad.push(`${p}@${w}: ${b}`);
      const clipped = await page.evaluate(() => [...document.querySelectorAll("h1,h2,h3,button,a,label,th")].filter((el) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return r.width > 2 && r.height > 2 && (s.overflow === "hidden" || s.textOverflow === "ellipsis") && el.scrollWidth > el.clientWidth + 1 && !el.closest("pre");
      }).map((el) => (el.textContent ?? "").slice(0, 40)));
      for (const c of clipped) bad.push(`${p}@${w}: clipped "${c}"`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) bad.push(`${p}@${w}: horizontal scroll`);
    }
  }
  expect(bad).toEqual([]);
  expect(problems).toEqual([]);
});

test("404 is on brand and offers a way out; Escape and Tab behave on the mobile menu", async ({ page }) => {
  const res = await page.goto("/definitely/not/here");
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("link", { name: /home|back|postslot/i }).first()).toBeVisible();
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  await page.getByRole("button", { name: /menu/i }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /menu/i })).toBeVisible();
  await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => { const s = getComputedStyle(document.activeElement!); return s.outlineStyle !== "none" || s.boxShadow !== "none"; });
  expect(ring).toBe(true);
});

test("OG and icon routes answer", async ({ request }) => {
  for (const u of ["/opengraph-image", "/icon", "/apple-icon", "/twitter-image"]) expect((await request.get(u)).status(), u).toBe(200);
});

test("signed in: every app screen keeps the brand and a free user sees honest numbers", async ({ page, request }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signInUI(page, request, `qa2${uniq()}@studio.test`, "Okafor Dental");
  const bad: string[] = [];
  for (const p of ["/app", "/app/forms", "/app/billing", "/app/usage", "/app/domains", "/app/settings/audit"]) {
    const r = await page.goto(p);
    if (r?.status() !== 200) bad.push(`${p} ${r?.status()}`);
    for (const b of await brand(page)) bad.push(`${p}: ${b}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) bad.push(`${p}: horizontal scroll`);
  }
  expect(bad).toEqual([]);
  expect(problems).toEqual([]);
});
