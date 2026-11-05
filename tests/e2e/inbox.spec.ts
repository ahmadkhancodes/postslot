import { expect, test } from "@playwright/test";

// M2 end to end (memory driver, console mailer): plain HTML form, cross-origin fetch, spam, the inbox page.
test("form endpoint delivers, quarantines spam, and the inbox shows receipts", async ({ page, request, baseURL }) => {
  const email = `inbox+${Date.now()}@studio.test`;
  const origin = { origin: baseURL! };
  await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Harbor Studio", slug: `harbor-${Date.now()}` }, headers: origin });
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: (await org.json()).id }, headers: origin });

  // Empty state first, then create a form through the API.
  await page.goto("/app");
  await expect(page.getByText("Create your first form")).toBeVisible();
  const created = await page.request.post("/api/forms", { data: { name: "Contact page" }, headers: origin });
  expect(created.status()).toBe(201);
  const { form } = await created.json();
  const endpoint = `${baseURL}/f/${form.key}`;

  // Preflight + cross-origin fetch with Accept: application/json.
  const pre = await request.fetch(endpoint, { method: "OPTIONS", headers: { origin: "https://site.test", "access-control-request-method": "POST" } });
  expect(pre.status()).toBe(204);
  expect(pre.headers()["access-control-allow-origin"]).toBe("*");
  const viaFetch = await request.post(endpoint, { data: { email: "mara@visitor.test", name: "Mara Okafor", message: "Could you quote a rebrand of our site?" }, headers: { origin: "https://site.test", accept: "application/json" } });
  expect(viaFetch.status()).toBe(200);
  expect(viaFetch.headers()["access-control-allow-origin"]).toBe("*");
  expect(await viaFetch.json()).toMatchObject({ success: true, message: "Submission received" });

  // A plain HTML form with no JavaScript lands on the default thank-you page.
  await page.setContent(`<form action="${endpoint}" method="POST"><input name="email" value="tom@visitor.test"><input name="name" value="Tom Reyes"><textarea name="message">Is the studio taking new work in March?</textarea><button>Send</button></form>`);
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForURL("**/thanks");
  await expect(page.getByRole("heading", { name: /your message was sent/ })).toBeVisible();

  // Spam: honeypot is accepted silently and quarantined.
  const bot = await request.post(endpoint, { data: { message: "cheap pills", _gotcha: "x" }, headers: { accept: "application/json", "x-forwarded-for": "8.8.8.8" } });
  expect((await bot.json()).success).toBe(true);
  expect((await request.post(endpoint, { data: {}, headers: { accept: "application/json", "x-forwarded-for": "8.8.4.4" } })).status()).toBe(422);
  expect((await request.post(`${baseURL}/f/${"a".repeat(22)}`, { data: { a: "b" }, headers: { accept: "application/json" } })).status()).toBe(404);

  // Delivery runs after the response: wait until both real submissions show Delivered.
  await expect.poll(async () => ((await (await page.request.get("/api/submissions/export?filter=delivered")).text()).match(/delivered/g) ?? []).length, { timeout: 15_000 }).toBe(2);
  const csv = await (await page.request.get("/api/submissions/export")).text();
  expect(csv).toContain("Mara Okafor");
  expect(csv).not.toContain("cheap pills"); // spam is not in the default view

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Mara Okafor/ })).toBeVisible();
  await page.getByRole("link", { name: /Mara Okafor/ }).click();
  await expect(page.getByRole("heading", { name: "Delivery receipt" })).toBeVisible();
  for (const stamp of ["Received", "Sorted", "Dispatched", "Accepted"]) await expect(page.getByText(stamp, { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("img", { name: /Postmark: delivered/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Redeliver" })).toBeVisible();

  // Search and the spam tab.
  await page.getByLabel("Search submissions").fill("March");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("link", { name: /Tom Reyes/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Mara Okafor/ })).toHaveCount(0);
  await page.goto("/app?filter=spam");
  await expect(page.getByText("Spam blocked").first()).toBeVisible();
  await page.getByRole("link", { name: /Anonymous/ }).click();
  await expect(page.getByRole("button", { name: "Not spam" })).toBeVisible();
  await expect(page.getByText("A hidden field was filled in")).toBeVisible();

  // Forms page and install snippet picker.
  await page.goto(`/app/forms/${form._id}`);
  await expect(page.getByText(endpoint).first()).toBeVisible();
  await page.getByRole("tab", { name: "React" }).click();
  await expect(page.getByText("onSubmit")).toBeVisible();

  // Screenshots of the inbox page (docs/qa/m2).
  for (const theme of ["light", "dark"] as const) {
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: width > 800 ? 900 : 812 });
      await page.addInitScript((t) => localStorage.setItem("theme", t), theme);
      await page.goto("/app?" + (width > 800 ? "" : ""));
      await page.evaluate((t) => { localStorage.setItem("theme", t); document.documentElement.dataset.theme = t; }, theme);
      const first = page.getByRole("link", { name: /Mara Okafor/ });
      if (width > 800) await first.click();
      await page.waitForTimeout(300);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
      await page.screenshot({ path: `docs/qa/m2/inbox-${width}-${theme}.png`, fullPage: true });
    }
  }
});
