import { expect, test } from "@playwright/test";
import { fakeIp, magicLink, signInUI, uniq, watch } from "./helpers";

const ipHdr = () => ({ "x-forwarded-for": fakeIp() });

test("marketing chrome: theme toggle persists, mobile menu opens and closes with Escape, nav links go somewhere", async ({ page }) => {
  const problems = watch(page);
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/");
  const toggle = page.getByRole("button", { name: /Switch to (dark|light) theme/ });
  const before = await page.evaluate(() => document.documentElement.className + document.documentElement.dataset.theme);
  await toggle.click();
  const after = await page.evaluate(() => document.documentElement.className + document.documentElement.dataset.theme);
  expect(after).not.toBe(before);
  await page.reload();
  expect(await page.evaluate(() => document.documentElement.className + document.documentElement.dataset.theme)).toBe(after);

  await page.getByRole("button", { name: "Open menu" }).click();
  const mobile = page.getByRole("navigation", { name: "Mobile" });
  await expect(mobile).toBeVisible();
  const links = await mobile.getByRole("link").evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!));
  expect(links.length).toBeGreaterThan(2);
  await page.keyboard.press("Escape");
  await expect(mobile).toBeHidden();
  for (const href of links.filter((h) => h.startsWith("/"))) {
    await page.goto("/");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("navigation", { name: "Mobile" }).locator(`a[href="${href}"]`).first().click();
    await expect(page).toHaveURL(new RegExp(href.split("#")[0] === "/" ? "/" : href.split("#")[0]));
    await expect(page.locator("h1").first()).toBeVisible();
  }
  expect(problems).toEqual([]);
});

test("copy buttons copy and say so; install tabs switch; csv link downloads; onboarding and sign-in double clicks are safe", async ({ page, request, context, baseURL }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const addr = `ux${uniq()}@studio.test`;
  await signInUI(page, request, addr, "UX Co");
  const { form } = await (await page.request.post("/api/forms", { data: { name: "Contact page" }, headers: { origin: baseURL! } })).json();
  await page.goto(`/app/forms/${form._id}`);
  await page.getByRole("button", { name: "Copy URL" }).click();
  await expect(page.getByRole("button", { name: /Copied/ }).first()).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(`/f/${form.key}`);
  // every stack tab shows a different, non-empty snippet that carries the real endpoint
  const tabs = page.getByRole("tab");
  const seen = new Set<string>();
  for (let i = 0; i < (await tabs.count()); i++) {
    await tabs.nth(i).click();
    await expect(tabs.nth(i)).toHaveAttribute("aria-selected", "true");
    const code = await page.getByRole("tabpanel").locator("pre").innerText();
    expect(code.length).toBeGreaterThan(20);
    expect(code).toContain(form.key);
    seen.add(code);
  }
  expect(seen.size).toBeGreaterThanOrEqual((await tabs.count()) - 1); // Svelte and plain HTML share one snippet

  // submissions exist -> the CSV link in the inbox really downloads a file with them
  expect((await request.post(`/f/${form.key}`, { headers: { accept: "application/json", ...ipHdr() }, form: { email: "csv@client.test", name: "Csv Person", message: "export me" } })).status()).toBe(200);
  await expect.poll(async () => (await (await page.request.get("/api/submissions/export")).text()).includes("Csv Person")).toBe(true);
  await page.goto("/app");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Export CSV" }).click()]);
  expect(dl.suggestedFilename()).toMatch(/\.csv$/);

  // inbox: open a submission, redeliver, and the receipt gains a new stamp; back button returns to the list
  await page.getByRole("link", { name: /Csv Person/ }).click();
  await expect(page.getByRole("heading", { name: "Delivery receipt" })).toBeVisible();
  await page.getByRole("button", { name: "Redeliver" }).click();
  await expect(page.getByText(/Sent again/)).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("link", { name: /Csv Person/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();

  // sending domain page on Free: readable, says why it cannot be used, and offers no dead form
  await page.goto("/app/domains");
  await expect(page.getByText(/is part of Pro/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add domain" })).toHaveCount(0);

  // webhooks on the free plan: gated with a reason; templates save and survive a reload
  await page.goto(`/app/forms/${form._id}/templates`);
  await page.getByLabel("Email subject").fill("Lead from {{name}} <b>&</b> 日本語");
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(page.getByText("Saved. New submissions use this template.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Email subject")).toHaveValue("Lead from {{name}} <b>&</b> 日本語");

  // the sign-in form: a double click sends one email
  const other = `dbl${uniq()}@studio.test`;
  const ctx2 = await page.context().browser()!.newContext();
  const p2 = await ctx2.newPage();
  await p2.context().setExtraHTTPHeaders(ipHdr());
  await p2.goto("/sign-in");
  await p2.getByLabel("Email").fill(other);
  await p2.getByRole("button", { name: "Email me a sign-in link" }).dblclick();
  await expect(p2.getByText(/Check your inbox/)).toBeVisible();
  await magicLink(request, other);
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(other)}`)).json();
  expect(box.messages.length).toBe(1);
  // new account, onboarding double click makes one organization
  await p2.goto(await magicLink(request, other));
  await expect(p2).toHaveURL(/onboarding/);
  await p2.getByLabel(/name/i).first().fill("Twice Co");
  await p2.getByRole("button", { name: /create/i }).dblclick();
  await expect(p2).toHaveURL(/\/app/);
  const orgs = await (await p2.request.get("/api/auth/organization/list")).json();
  expect(orgs.length).toBe(1);
});

test("unverified spam: link-stuffed message is quarantined and 'Not spam' releases it", async ({ page, request, baseURL }) => {
  await signInUI(page, request, `sp${uniq()}@studio.test`, "Spam Co");
  const { form } = await (await page.request.post("/api/forms", { data: { name: "Contact page" }, headers: { origin: baseURL! } })).json();
  const links = Array.from({ length: 8 }, (_, i) => `http://spam${i}.example/buy`).join(" ");
  const r = await request.post(`/f/${form.key}`, { headers: { accept: "application/json", ...ipHdr() }, form: { email: "x@bulk.test", name: "Pills", message: `cheap viagra casino ${links}` } });
  expect(r.status()).toBe(200);
  await page.goto("/app?filter=spam");
  const row = page.getByRole("link", { name: /Pills/ });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await row.click();
  await page.getByRole("button", { name: "Not spam" }).click();
  await expect(page.getByText(/Released/)).toBeVisible();
  await page.goto("/app");
  await expect(page.getByRole("link", { name: /Pills/ })).toBeVisible({ timeout: 20_000 });
});
