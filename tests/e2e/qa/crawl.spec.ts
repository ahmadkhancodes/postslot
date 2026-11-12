import { expect, test } from "@playwright/test";
import { fakeIp, magicLink, signInUI, uniq, watch } from "./helpers";

const PUBLIC = ["/", "/pricing", "/compare/web3forms", "/docs", "/docs/install", "/legal/privacy", "/legal/terms", "/status", "/sign-in"];

async function audit(page: import("@playwright/test").Page, path: string) {
  return page.evaluate(() => {
    const out: string[] = [];
    const vis = (el: Element) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
    document.querySelectorAll("button, a[href], [role=button], input:not([type=hidden]), select, textarea").forEach((el) => {
      if (!vis(el)) return;
      const name = (el.getAttribute("aria-label") || el.textContent || (el as HTMLInputElement).placeholder || el.getAttribute("title") || "").trim();
      const labelled = (el as HTMLInputElement).labels?.length || el.getAttribute("aria-labelledby");
      if (!name && !labelled) out.push(`no accessible name: ${el.outerHTML.slice(0, 120)}`);
      const tag = el.tagName.toLowerCase();
      if ((tag === "button" || tag === "a" || el.getAttribute("role") === "button") && getComputedStyle(el).cursor !== "pointer" && !(el as HTMLButtonElement).disabled) out.push(`cursor ${getComputedStyle(el).cursor}: ${name.slice(0, 40)}`);
    });
    if (document.documentElement.scrollWidth > window.innerWidth) out.push("horizontal scroll");
    if (document.querySelectorAll("h1").length !== 1) out.push(`h1 count ${document.querySelectorAll("h1").length}`);
    return out;
  }).then((o) => o.map((x) => `${path}: ${x}`));
}

test("signed out: every public page, link and control is sane at 375 and 1440, light and dark", async ({ page, request }) => {
  const problems = watch(page);
  const bad: string[] = [];
  const links = new Set<string>();
  for (const [w, scheme] of [[375, "light"], [1440, "dark"]] as const) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.emulateMedia({ colorScheme: scheme });
    for (const p of PUBLIC) {
      const res = await page.goto(p);
      if (res?.status() !== 200) bad.push(`${p} -> ${res?.status()}`);
      bad.push(...(await audit(page, `${p}@${w}`)));
      for (const h of await page.locator("a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))) links.add(h);
    }
  }
  for (const h of links) {
    if (/^(mailto:|tel:|#)/.test(h) || /^https?:\/\/(?!localhost)/.test(h)) continue;
    const r = await request.get(h.startsWith("http") ? h : h, { maxRedirects: 5 });
    if (r.status() >= 400) bad.push(`dead link ${h} -> ${r.status()}`);
  }
  expect(bad).toEqual([]);
  expect(problems).toEqual([]);
});

test("signed out: protected routes bounce to sign-in and return to the page after login", async ({ page, request }) => {
  for (const p of ["/app", "/app/forms", "/app/billing", "/admin"]) {
    await page.goto(p);
    await expect(page).toHaveURL(/\/sign-in\?next=/);
  }
  const email = `ret${uniq()}@studio.test`;
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() });
  await page.goto("/app/billing");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(/Check your inbox/)).toBeVisible();
  await page.goto(await magicLink(request, email));
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel(/name/i).first().fill("Return Co");
  await page.getByRole("button", { name: /create/i }).click();
  await expect(page).toHaveURL(/\/app\/billing/);
});

test("signed in: every app page, link and control is sane at 375 and 1440, light and dark", async ({ page, request }) => {
  const problems = watch(page);
  await signInUI(page, request, `crawl${uniq()}@studio.test`);
  const { form } = await (await page.request.post("/api/forms", { data: { name: "Contact page" }, headers: { origin: new URL(page.url()).origin } })).json();
  const paths = ["/app", "/app/forms", `/app/forms/${form._id}`, `/app/forms/${form._id}/templates`, `/app/forms/${form._id}/webhooks`, `/app/forms/${form._id}/onboarding`, "/app/billing", "/app/domains", "/app/usage", "/app/settings/api-keys", "/app/settings/audit", "/app/settings/members", "/app/settings/profile", "/app/settings/security", "/app/settings/webhooks"];
  const bad: string[] = [];
  const links = new Set<string>();
  for (const [w, scheme] of [[375, "dark"], [1440, "light"]] as const) {
    await page.setViewportSize({ width: w, height: 800 });
    await page.emulateMedia({ colorScheme: scheme });
    for (const p of paths) {
      const res = await page.goto(p);
      if (res?.status() !== 200) bad.push(`${p} -> ${res?.status()}`);
      bad.push(...(await audit(page, `${p}@${w}`)));
      for (const h of await page.locator("a[href]").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!))) links.add(h);
    }
  }
  for (const h of links) {
    if (/^(mailto:|tel:|#)/.test(h) || /^https?:\/\/(?!localhost)/.test(h) || h.startsWith("/api/auth/sign-out")) continue;
    const r = await page.request.get(h, { maxRedirects: 5 });
    if (r.status() >= 400) bad.push(`dead link ${h} -> ${r.status()}`);
  }
  expect(bad).toEqual([]);
  expect(problems).toEqual([]);
});
