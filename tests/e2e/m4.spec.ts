import { expect, test } from "@playwright/test";

// M4 pages: usage, sending domain, founder admin, test label and search hint in the inbox.
test("usage, sending domain, admin and inbox polish", async ({ page, request, baseURL }) => {
  const email = "founder@studio.test";
  const origin = { origin: baseURL! };
  await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  const org = await (await page.request.post("/api/auth/organization/create", { data: { name: "Harbor Studio", slug: `m4-${Date.now()}` }, headers: origin })).json();
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: org.id }, headers: origin });
  const { form } = await (await page.request.post("/api/forms", { data: { name: "Contact page" }, headers: origin })).json();
  const shots = (name: string) => page.screenshot({ path: `docs/qa/m4/${name}.png`, fullPage: true });
  const noOverflow = async () => {
    const wide = await page.evaluate(() => (document.documentElement.scrollWidth > window.innerWidth ? [...document.querySelectorAll("main *")].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 3).map((e) => `${e.tagName}.${String(e.className).slice(0, 60)}`) : []));
    expect(wide, `overflow on ${page.url()}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  };

  // A real post and a test submission.
  const post = await request.post(`/f/${form.key}`, { form: { name: "Mara Okafor", email: "mara@example.com", message: "Hello there" }, headers: { accept: "application/json" } });
  expect(post.ok()).toBe(true);
  expect((await page.request.post(`/api/forms/${form._id}/test`, { data: {}, headers: origin })).ok()).toBe(true);

  // Inbox: test label and the whole-word search hint.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");
  await expect(page.getByText("Test submission").first()).toBeVisible();
  await expect(page.getByText("Search matches whole words")).toBeVisible();

  // Usage.
  await page.goto("/app/usage");
  await expect(page.getByRole("heading", { name: "Usage", exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: /Submissions per month for the last 12 months/ })).toBeVisible();
  await expect(page.getByRole("table", { name: "Monthly usage" })).toBeVisible();
  await shots("usage-1440-light");

  // Sending domain: gated on Free, open after a plan override from the admin.
  await page.goto("/app/domains");
  await expect(page.getByText("Depends on the own mail server path")).toBeVisible();
  await expect(page.getByText("Your plan can read this page but not add a domain.")).toBeVisible();
  expect((await page.request.post("/api/admin/action", { data: { type: "plan.set", orgId: org.id, plan: "pro" }, headers: origin })).ok()).toBe(true);
  await page.goto("/app/domains");
  await page.getByLabel("Add a domain").fill("studio.example");
  await page.getByRole("button", { name: "Add domain" }).click();
  await expect(page.getByRole("heading", { name: "studio.example" })).toBeVisible();
  await expect(page.getByText("postslot1._domainkey.studio.example")).toBeVisible();
  await page.getByRole("button", { name: "Check records" }).click();
  await expect(page.getByText("Fail", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await shots("domains-1440-light");

  // Founder admin.
  await page.goto(`/admin?q=${encodeURIComponent(form.key)}`);
  await expect(page.getByRole("heading", { name: "Mail pipeline" })).toBeVisible();
  await expect(page.getByRole("table", { name: "Forms" })).toContainText("Contact page");
  await shots("admin-1440-light");
  await page.goto(`/admin/org/${org.id}`);
  await expect(page.getByRole("heading", { name: "Abuse signals" })).toBeVisible();
  await page.getByRole("button", { name: "Suspend", exact: true }).click();
  await expect(page.getByText("Saved and written to the audit log.")).toBeVisible();
  await expect(page.getByRole("table", { name: "Forms" })).toContainText("suspended");
  expect((await request.post(`/f/${form.key}`, { form: { message: "x" }, headers: { accept: "application/json" } })).status()).toBe(403);
  await expect(page.getByRole("table", { name: "Audit entries" })).toContainText("admin.form.suspend");
  await shots("admin-org-1440-light");
  await page.goto("/admin/suppressions");
  await page.getByLabel("Email address").fill("blocked@example.com");
  await page.getByRole("button", { name: "Suppress address" }).click();
  await expect(page.getByRole("table", { name: "Suppressed addresses" })).toContainText("blocked@example.com");
  await shots("admin-suppressions-1440-light");

  // Mobile.
  await page.setViewportSize({ width: 375, height: 800 });
  for (const [path, name] of [["/app/usage", "usage"], ["/app/domains", "domains"], ["/admin", "admin"], [`/admin/org/${org.id}`, "admin-org"]] as const) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await noOverflow();
    await shots(`${name}-375-light`);
  }
  // Non-founders get a 404 on /admin.
  const other = `m4-other+${Date.now()}@studio.test`;
  const ctx = await page.context().browser()!.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": "198.51.100.44" } });
  const p2 = await ctx.newPage();
  await p2.request.post("/api/auth/sign-in/magic-link", { data: { email: other, callbackURL: "/app" }, headers: { ...origin, "x-forwarded-for": "198.51.100.44" } });
  const box2 = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(other)}`)).json();
  await p2.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box2.messages.at(-1).text)![0]);
  expect((await p2.goto("/admin"))!.status()).toBe(404);
  expect((await p2.request.post("/api/admin/action", { data: { type: "org.suspend", orgId: org.id }, headers: origin })).status()).toBe(404);
  await ctx.close();
});
