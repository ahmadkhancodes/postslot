import { expect, test, type Locator, type Page } from "@playwright/test";
import { product } from "../../../src/config/product";
import { fakeIp, signInUI, uniq, watch } from "../qa/helpers";

// Three ICP personas (docs/QA-REPORT.md "Usefulness pass") walked through day 1 (first value), day 2 (a second person or
// a second thing) and day 7 (the limit and the decision to pay), with real clicks on the production build.

test.skip(!!process.env.BASE_URL, "uses the local app's e-mail outbox and admin");

/** Light screenshots at both QA widths into docs/qa/usefulness/. */
async function shots(page: Page, name: string) {
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 900 });
    await page.screenshot({ path: `docs/qa/usefulness/${name}-${width}-light.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 720 });
}

const counted = () => {
  let n = 0;
  return { click: async (l: Locator) => { n++; await l.click(); }, get count() { return n; } };
};

async function renderAndSubmit(page: Page, markup: string) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() });
  await page.setContent(`<!doctype html><html><body>${markup}</body></html>`);
  for (const f of await page.locator("form input:visible, form textarea:visible").all()) {
    const type = (await f.getAttribute("type")) ?? "text";
    if (!["hidden", "checkbox", "submit"].includes(type)) await f.fill(type === "email" ? "lead@client.test" : "Quote for a new site please");
  }
  await page.locator("form button").first().click();
}

test("Jake, freelance developer moving client sites off Formspree: first receipt in two clicks, old form fixed for him", async ({ page, request, baseURL }) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  const email = `jake${uniq()}@studio.test`;
  await signInUI(page, request, email, "Jake Builds");
  await expect(page).toHaveURL(/\/app$/);

  // Day 1: the empty inbox already holds a named first form; create it and send a test without leaving the page it lands on.
  const ui = counted();
  await expect(page.getByLabel("Form name")).toHaveValue("Contact form");
  await expect(page.getByText(`Mail goes to ${email}, already confirmed.`)).toBeVisible();
  await shots(page, "day1-inbox-first-form");
  await ui.click(page.getByRole("button", { name: "Create form" }));
  await page.waitForURL(/\/app\/forms\/[^/]+$/);
  const formUrl = page.url();
  await ui.click(page.getByRole("button", { name: "Send test submission" }));
  await expect(page.getByRole("status", { name: "Test receipt" })).toContainText("Accepted");
  expect(ui.count, "clicks from a new workspace to the first delivery receipt").toBeLessThanOrEqual(2);
  await shots(page, "day1-first-receipt");
  await expect.poll(async () => (await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json()).messages.map((m: { subject: string }) => m.subject).join("|")).toContain("[Test]");
  // Once the form has a submission the install page is back to install and settings only.
  await page.reload();
  await expect(page.getByRole("button", { name: "Send test submission" })).toHaveCount(0);

  // Day 1, later: he pastes the Formspree form from a client site; the check hands back a corrected copy.
  await page.goto(`${formUrl}/onboarding`);
  const formspree = `<form action="https://formspree.io/f/xyzabcde">\n  <input type="email" name="email">\n  <textarea name="message"></textarea>\n  <input type="hidden" name="_next" value="${baseURL}/thanks?from=formspree">\n  <button>Send</button>\n</form>`;
  await page.getByLabel("Your form HTML").fill(formspree);
  await page.getByRole("button", { name: "Check form" }).click();
  await expect(page.getByRole("list", { name: "Linter results" })).toContainText("not this form's endpoint URL");
  const corrected = await page.getByLabel("Corrected form").innerText();
  await expect(page.getByRole("button", { name: "Copy corrected form" })).toBeVisible();
  await shots(page, "day1-corrected-form");
  await renderAndSubmit(page, corrected);
  await page.waitForURL(`${baseURL}/thanks?from=formspree`); // Formspree's _next is honoured
  await page.context().setExtraHTTPHeaders({});

  // A Web3Forms site: only the action changes; access_key and botcheck stay in the markup and never show up as fields.
  const { key } = (await (await page.request.get("/api/forms")).json()).forms[0];
  await renderAndSubmit(page, `<form action="${baseURL}/f/${key}" method="POST"><input type="hidden" name="access_key" value="w3f-000"><input type="email" name="email"><textarea name="message"></textarea><input type="checkbox" name="botcheck" style="display:none"><button>Send</button></form>`);
  await page.waitForURL(`${baseURL}/thanks**`);
  await page.context().setExtraHTTPHeaders({});
  const csv = await (await page.request.get("/api/submissions/export")).text();
  expect(csv.split("\n").length, "test + two real posts").toBeGreaterThanOrEqual(4);
  for (const name of ["access_key", "_next", "w3f-000"]) expect(csv).not.toContain(name);

  // Day 2: an API key for his deploy script, with the first request already filled in.
  await page.goto("/app/settings/api-keys");
  await page.getByLabel("Name").fill("Deploy script");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByLabel("First request")).toContainText(`curl ${baseURL}/api/v1/me`);
  await expect(page.getByRole("button", { name: "Copy command" })).toBeVisible();
  expect(problems).toEqual([]);
});

test("Maya, AI-builder founder: prompt with her key for Lovable, a co-founder as second recipient points to the plan that allows it", async ({ page, request, baseURL }) => {
  const problems = watch(page);
  await signInUI(page, request, `maya${uniq()}@studio.test`, "Maya Launches");
  await page.getByRole("button", { name: "Create form" }).click();
  await page.waitForURL(/\/app\/forms\/[^/]+$/);
  const endpoint = (await page.locator("code").first().innerText()).trim();
  expect(endpoint).toMatch(new RegExp(`^${baseURL}/f/[0-9A-Za-z]{22}$`));

  // Day 1: the Lovable tab is a prompt with her real endpoint, nothing to edit.
  await page.getByRole("tab", { name: "Lovable" }).click();
  const prompt = page.getByRole("tabpanel").locator("pre");
  await expect(prompt).toContainText(`Post the form to ${endpoint} with method POST`);
  await expect(prompt).not.toContainText("<form_key>");
  await expect(page.getByText("Your form key is already in it.")).toBeVisible();

  // Day 2: her co-founder should get the leads too. Free confirms one address; the message names the plans and links them.
  await page.getByLabel("Add a recipient").fill("cofounder@studio.test");
  await page.getByRole("button", { name: "Add and confirm" }).click();
  const starter = product.plans.find((p) => p.id === "starter")!;
  const limitAlert = page.getByRole("alert").filter({ hasText: "recipient limit" });
  await expect(limitAlert).toContainText(`${starter.name} confirms ${starter.limits.recipients} addresses`);
  await limitAlert.getByRole("link", { name: "See plans" }).click();
  await expect(page).toHaveURL(/\/app\/billing$/);
  expect(problems.filter((p) => !/ 40\d /.test(p))).toEqual([]);
});

test("Tom, agency owner: seat limit is explained before he invites, at the limit billing shows what waits and which plan takes it", async ({ page, request, baseURL }) => {
  test.setTimeout(180_000);
  const origin = { origin: baseURL! };
  await signInUI(page, request, `tom${uniq()}@studio.test`, "Tom & Partners");

  // Day 2: a teammate. The members page says how many seats Free has before he sends anything.
  await page.goto("/app/settings/members");
  await expect(page.getByText("Your plan includes 1 seat")).toBeVisible();

  // Day 7: three client sites launch the same week and together pass the Free plan's monthly submissions by two.
  const free = product.plans.find((p) => p.id === "free")!.limits.submissions;
  const forms = await Promise.all(["Bakery", "Dentist", "Garage"].map(async (name) => (await (await page.request.post("/api/forms", { data: { name }, headers: origin })).json()).form));
  for (let i = 0; i < free + 2; i++) {
    const f = forms[i % forms.length];
    const r = await request.post(`/f/${f.key}`, { headers: { accept: "application/json", "x-forwarded-for": fakeIp() }, form: { email: `visitor${i}@client.test`, message: `Booking request number ${i} for next week` } });
    expect(r.status(), "never rejected at the cap").toBe(200);
  }
  await page.goto("/app");
  await expect(page.getByText("You are over your limit")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("link", { name: "Upgrade", exact: true }).first().click();
  await page.waitForURL(/\/app\/billing$/, { timeout: 15_000 });
  await expect(async () => {
    await page.reload();
    await expect(page.getByText("2 submissions are waiting over your limit")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByText("Upgrading to Starter releases them right away")).toBeVisible();
  await expect(page.getByRole("article", { name: "Starter" }).getByText("Fits your usage")).toBeVisible();
  await shots(page, "day7-billing-waiting");
});
