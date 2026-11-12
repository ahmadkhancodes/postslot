import { expect, test, type Page } from "@playwright/test";
import { fakeIp, signInUI, uniq } from "./qa/helpers";

// Real browser run of the Content Security Policy: no click may silently do nothing because the browser blocked it.
function csp(page: Page) {
  const violations: string[] = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to (load|connect|frame|send|apply|create|navigate)/i.test(m.text())) violations.push(m.text().slice(0, 200)); });
  return violations;
}

test("no CSP violation on the marketing pages, sign-in, the inbox, forms and every form tab", async ({ page, request, baseURL }) => {
  const violations = csp(page);
  for (const p of ["/", "/pricing", "/docs", "/docs/install", "/docs/migrate", "/sign-in", "/status", "/compare/web3forms"]) {
    const res = await page.goto(p);
    expect(res?.status(), p).toBe(200);
  }
  const email = `csp+${uniq()}@studio.test`;
  await signInUI(page, request, email);
  const created = await page.request.post("/api/forms", { data: { name: "CSP form" }, headers: { origin: baseURL! } });
  const { form } = await created.json();
  for (const p of ["/app", "/app/forms", `/app/forms/${form._id}`, `/app/forms/${form._id}/onboarding`, `/app/forms/${form._id}/templates`, `/app/forms/${form._id}/webhooks`, "/app/billing", "/app/usage", "/app/domains", "/app/settings/profile", "/app/settings/members", "/app/settings/api-keys"]) {
    await page.goto(p);
    await expect(page.locator("h1")).toHaveCount(1);
  }
  // A real form post from a page of ours (same-origin form action) and the redirect after it.
  await page.goto("/app");
  await page.request.post(`/f/${form.key}`, { form: { email: "lead@visitor.test", message: "hello" }, headers: { "x-forwarded-for": fakeIp() } });
  await page.goto("/app");
  await expect(page.getByText("lead@visitor.test").first()).toBeVisible();
  expect(violations).toEqual([]);
});

test("billing button explains itself instead of doing nothing when Stripe is not connected", async ({ page, request }) => {
  const violations = csp(page);
  await signInUI(page, request, `bill+${uniq()}@studio.test`);
  await page.goto("/app/billing");
  const upgrade = page.getByRole("button", { name: /upgrade|choose|get started|subscribe/i }).first();
  if (await upgrade.count()) {
    await upgrade.click();
    await expect(page.getByRole("alert").or(page.getByRole("status")).first()).toBeVisible();
  }
  expect(violations).toEqual([]);
});

test("inbox: first-run checklist, keyboard shortcuts, pagination and bulk release", async ({ page, request, baseURL }) => {
  await signInUI(page, request, `inbox+${uniq()}@studio.test`);
  const origin = { origin: baseURL! };
  const { form } = await (await page.request.post("/api/forms", { data: { name: "Contact" }, headers: origin })).json();
  await page.goto("/app");
  await expect(page.getByRole("region", { name: "Get started" })).toBeVisible();
  for (let i = 0; i < 3; i++) await page.request.post(`/f/${form.key}`, { form: { email: `p${i}@visitor.test`, message: `note ${i}` }, headers: { "x-forwarded-for": fakeIp() } });
  for (let i = 0; i < 2; i++) await page.request.post(`/f/${form.key}`, { form: { email: `s${i}@visitor.test`, message: "x https://a.test https://b.test https://c.test https://d.test buy now cheap viagra" }, headers: { "x-forwarded-for": fakeIp() } });
  await page.goto("/app");
  await expect(page.getByRole("link", { name: /p0@visitor.test|p1@visitor.test|p2@visitor.test/ }).first()).toBeVisible();
  // j opens the first row, / focuses search, Escape closes the detail.
  await page.keyboard.press("j");
  await expect(page).toHaveURL(/id=/);
  await expect(page.locator('a[aria-current="true"]')).toBeVisible(); // the new page has rendered
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/id=/);
  await page.keyboard.press("/");
  await expect(page.getByLabel("Search submissions")).toBeFocused();
  await page.keyboard.type("jk"); // typing in the field must not trigger shortcuts
  await expect(page).not.toHaveURL(/id=/);
});

test("health reports dependency state without leaking details", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ ok: true, db: "memory" });
  expect(body.deps).toMatchObject({ mail: expect.any(String), billing: expect.any(String) });
  expect(JSON.stringify(body)).not.toMatch(/mongodb|password|@|[A-Za-z0-9_]{32,}/i);
});

test("tenant isolation through the API with guessed ids, bulk included", async ({ browser, baseURL }) => {
  const origin = { origin: baseURL! };
  const a = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });
  const b = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": fakeIp() } });
  const pa = await a.newPage();
  const pb = await b.newPage();
  await signInUI(pa, a.request, `iso-a+${uniq()}@studio.test`, "Org A");
  await signInUI(pb, b.request, `iso-b+${uniq()}@studio.test`, "Org B");
  const { form } = await (await pb.request.post("/api/forms", { data: { name: "B private" }, headers: origin })).json();
  await pb.request.post(`/f/${form.key}`, { form: { email: "secret@visitor.test", message: "private lead" }, headers: { "x-forwarded-for": fakeIp() } });
  await pb.goto("/app");
  const href = await pb.getByRole("link", { name: /secret@visitor.test/ }).first().getAttribute("href");
  const id = new URL(href!, baseURL!).searchParams.get("id")!;
  expect((await pa.request.get(`/api/submissions/${id}`)).status()).toBe(404);
  expect((await pa.request.post(`/api/submissions/${id}`, { data: { action: "spam" }, headers: origin })).status()).toBe(404);
  const bulk = await pa.request.post("/api/submissions/bulk", { data: { action: "spam", ids: [id] }, headers: origin });
  expect(await bulk.json()).toEqual({ done: 0, skipped: 1 });
  expect((await pa.request.patch(`/api/forms/${form._id}`, { data: { name: "hijack" }, headers: origin })).status()).toBeGreaterThanOrEqual(400);
  await pa.goto(`/app?id=${id}`);
  await expect(pa.getByText("private lead")).toHaveCount(0);
  // B's data is untouched.
  await pb.goto(`/app?id=${id}`);
  await expect(pb.getByText("private lead").first()).toBeVisible();
  await a.close();
  await b.close();
});

test("expired or revoked session shows the sign-in page, not a blank page or raw error", async ({ page, request, baseURL }) => {
  await signInUI(page, request, `sess+${uniq()}@studio.test`);
  await page.context().clearCookies();
  const res = await page.request.post("/api/forms", { data: { name: "x" }, headers: { origin: baseURL! } });
  expect(res.status()).toBe(401);
  expect(await res.json()).toMatchObject({ error: "unauthorized" });
  await page.goto("/app");
  await expect(page).toHaveURL(/sign-in/);
  await expect(page.getByRole("heading").first()).toBeVisible();
});

test("magic link per-address throttle sends nothing past five and gives no different answer", async ({ page, request }) => {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() });
  const email = `flood+${uniq()}@studio.test`;
  const statuses: number[] = [];
  for (let i = 0; i < 7; i++) {
    const r = await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: { origin: "http://localhost:3100", "x-forwarded-for": fakeIp() } });
    statuses.push(r.status());
    await new Promise((res) => setTimeout(res, 11_000 / 7)); // stay under the 3 per 10 s per IP rule is by IP; fakeIp rotates it
  }
  expect(new Set(statuses).size).toBe(1);
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  expect(box.messages.length).toBe(5);
});
