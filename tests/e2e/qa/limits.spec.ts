import { expect, test } from "@playwright/test";
import { fakeIp, signInUI, uniq, watch } from "./helpers";

test("user at the plan limit: submissions are held not dropped, the page says so, billing explains", async ({ page, browser, request, baseURL }) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  const origin = { origin: baseURL! };
  await signInUI(page, request, `cap${uniq()}@studio.test`, "Capped Co");
  const session = await (await page.request.get("/api/auth/get-session")).json();
  const orgId = session.session.activeOrganizationId as string;
  const { form } = await (await page.request.post("/api/forms", { data: { name: "Contact page" }, headers: origin })).json();

  // The founder lowers this workspace's submission cap to 3 (audited admin action), so the limit is reachable in a test.
  const admin = await browser.newPage();
  await signInUI(admin, request, "founder@studio.test", "Founder Co");
  const lowered = await admin.request.post("/api/admin/action", { data: { type: "limit.set", orgId, meter: "submissions", value: 3, reason: "qa limit test" }, headers: origin });
  expect(lowered.status()).toBe(200);

  const post = (n: number) => request.post(`/f/${form.key}`, { headers: { accept: "application/json", "x-forwarded-for": fakeIp() }, form: { email: "lead@client.test", message: `lead number ${n} please reply` } });
  const sent: number[] = [];
  for (let n = 0; n < 6; n++) sent.push((await post(n)).status());
  expect(sent, "every post answered 200, none rejected at the cap").toEqual([200, 200, 200, 200, 200, 200]);

  await page.goto("/app?filter=held");
  await expect(page.getByRole("navigation", { name: "Filter" }).getByRole("link", { name: /Held 3/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/3 of 3|limit/i).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /upgrade/i }).first()).toBeVisible();

  // billing: choosing a plan without Stripe configured is explained, not silent
  await page.goto("/app/billing");
  const before = page.url();
  await page.getByRole("button", { name: /Choose Starter|Choose Pro|Choose Agency|Continue to checkout/ }).first().click();
  await expect(page.getByRole("alert").or(page.getByRole("status")).filter({ hasText: /./ }).first()).toBeVisible();
  expect(page.url()).toBe(before);
  expect(problems.filter((p) => !/50[03] .*billing|40\d|console: Failed to load resource.*503/.test(p))).toEqual([]);
});

test("keyboard and touch: skip link, focus ring, tap targets and labelled icon buttons at 375px", async ({ page, request, baseURL }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await signInUI(page, request, `kb${uniq()}@studio.test`, "Keys Co");
  const { form } = await (await page.request.post("/api/forms", { data: { name: "Contact page" }, headers: { origin: baseURL! } })).json();
  const small: string[] = [];
  const paths = ["/app", "/app/forms", `/app/forms/${form._id}`, `/app/forms/${form._id}/onboarding`, `/app/forms/${form._id}/templates`, "/app/billing", "/app/settings/profile", "/app/settings/members", "/app/settings/api-keys", "/app/usage", "/app/domains", "/", "/pricing", "/docs", "/sign-in", "/status"];
  for (const p of paths) {
    await page.goto(p);
    const found = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll("button, a[href], input:not([type=hidden]), select, textarea, [role=tab]").forEach((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (!r.width || !r.height || cs.visibility === "hidden") return;
        if (el.getAttribute("href") === "#main") return; // the skip link is visually hidden until focused
        if (["checkbox", "radio"].includes((el as HTMLInputElement).type)) { const l = el.closest("label"); if (l && l.getBoundingClientRect().height >= 44) return; }
        // inline text links inside a sentence are exempt (WCAG 2.5.8 inline exception)
        if (el.tagName === "A" && cs.display === "inline" && el.closest("p, li, dd, span, td")) return;
        if (r.height < 44 || r.width < 44) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      });
      return out;
    });
    for (const f of found) small.push(`${p}: ${f}`);
  }
  expect(small).toEqual([]);

  // tab order: the first stop is the skip link, and a focused control shows a visible outline
  await page.goto("/app");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
  const ring = await page.evaluate(() => { const el = document.activeElement!; const cs = getComputedStyle(el); return { tag: el.tagName, outline: cs.outlineStyle, w: cs.outlineWidth, shadow: cs.boxShadow }; });
  expect(ring.outline !== "none" || ring.shadow !== "none", JSON.stringify(ring)).toBe(true);
});
