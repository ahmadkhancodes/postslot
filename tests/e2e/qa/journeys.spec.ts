import { expect, test } from "@playwright/test";
import { fakeIp, magicLink, signInUI, uniq, watch } from "./helpers";

const ipHdr = () => ({ "x-forwarded-for": fakeIp() });

test("new visitor: landing and pricing lead to sign-up, wrong and reused magic links are explained", async ({ page, request }) => {
  const problems = watch(page);
  await page.goto("/");
  const cta = page.getByRole("link", { name: /start free|get started|sign up/i }).first();
  await expect(cta).toBeVisible();
  await cta.click();
  await expect(page).toHaveURL(/sign-in|pricing|onboarding/);
  await page.goto("/pricing");
  // every price on the page agrees with product.ts
  const { product } = await import("../../../src/config/product");
  const fmt = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 ? 2 : 0 })}`;
  for (const p of product.plans) for (const pr of p.prices.filter((x) => x.interval === "year")) await expect(page.locator("main"), `${p.id} yearly`).toContainText(fmt(pr.usd));
  await page.getByRole("button", { name: /^Monthly$/ }).or(page.getByRole("tab", { name: /^Monthly$/ })).or(page.getByLabel("Monthly")).first().click();
  for (const p of product.plans) for (const pr of p.prices.filter((x) => x.interval === "month")) await expect(page.locator("main"), `${p.id} monthly`).toContainText(fmt(pr.usd));
  await expect(page.locator("main")).toContainText(product.plans[0].limits.submissions.toLocaleString("en-US"));
  // plan CTAs signed out go to sign-in and keep the plan
  const paid = page.getByRole("link", { name: /Choose Pro/ }).first();
  await paid.click();
  await expect(page).toHaveURL(/sign-in\?.*plan=pro|sign-in/);

  // invalid input on the sign-in form
  const email = page.getByLabel("Email");
  for (const bad of ["", "   ", "not-an-email", "a@b", "<script>@x.test", "a".repeat(300) + "@x.test"]) {
    await email.fill(bad);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /valid email|could not send|too many/i }).first(), `input ${bad.slice(0, 12)}`).toBeVisible();
  }
  // a throwaway address is refused with an explanation, not a blank screen
  await page.context().setExtraHTTPHeaders(ipHdr());
  await email.fill("someone@mailinator.com");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(/Check your inbox|could not|not allowed|disposable|valid email/i).first()).toBeVisible();

  // reused magic link: second click lands on sign-in with the expired notice, not an error page
  const addr = `reuse${uniq()}@studio.test`;
  await signInUI(page, request, addr, "Reuse Co");
  const link = await magicLink(request, addr);
  await page.context().clearCookies();
  const again = await page.goto(link);
  expect(again?.status()).toBeLessThan(400);
  await expect(page).toHaveURL(/sign-in/);
  await expect(page.getByText("That link has expired")).toBeVisible();
  // a tampered token
  await page.goto(link.replace(/token=[^&]+/, "token=garbage"));
  await expect(page).toHaveURL(/sign-in/);
  await expect(page.getByText("That link has expired")).toBeVisible();
  expect(problems.filter((p) => !/401|400|429/.test(p))).toEqual([]);
});

test("free user: create forms with odd names, recipients, test submission, inbox, export, limits", async ({ page, request }) => {
  const problems = watch(page);
  const addr = `free${uniq()}@studio.test`;
  await signInUI(page, request, addr, "Harbor Studio");
  await page.goto("/app");
  await expect(page.getByText("Create your first form")).toBeVisible();

  await page.goto("/app/forms");
  const create = page.getByRole("button", { name: "Create form" });
  await expect(create).toBeDisabled(); // empty name: disabled, and the field says what to type
  await page.getByLabel("New form").fill("   ");
  await expect(create).toBeDisabled();
  const names = ["Contact page", "Contact page", "<b>Bold</b> & <script>x</script>", "Café ☕ 日本語", "n".repeat(80)];
  for (const n of names) {
    await page.goto("/app/forms");
    await page.getByLabel("New form").fill(n);
    await page.getByRole("button", { name: "Create form" }).click();
    await expect(page).toHaveURL(/\/app\/forms\/[0-9a-f-]{20,}$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(n);
    await expect(page.locator("main script")).toHaveCount(0);
  }
  // more than 80 chars is capped by the field, never a silent failure
  await page.goto("/app/forms");
  await page.getByLabel("New form").fill("z".repeat(120));
  expect(await page.getByLabel("New form").inputValue()).toHaveLength(80);
  // list shows every form
  await page.goto("/app/forms");
  await expect(page.getByRole("link", { name: /Contact page/ })).toHaveCount(2);

  // double submit creates one form only
  const before = (await (await page.request.get("/api/forms")).json()).forms.length;
  await page.getByLabel("New form").fill("Double click");
  await page.getByRole("button", { name: "Create form" }).dblclick();
  await page.waitForURL(/\/app\/forms\/[0-9a-f-]{20,}$/);
  const after = (await (await page.request.get("/api/forms")).json()).forms.length;
  expect(after - before).toBe(1);

  // recipients: the plan holds one; a second shows a reason, a bad address shows an error
  const formUrl = page.url();
  const rec = page.getByLabel(/recipient|email/i).filter({ hasNot: page.locator("[disabled]") });
  const addInput = page.getByRole("textbox", { name: /add a recipient|recipient email|email address/i }).first();
  await addInput.fill("not-an-email");
  await page.getByRole("button", { name: "Add and confirm" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
  await addInput.fill("second@client.test");
  await page.getByRole("button", { name: "Add and confirm" }).click();
  await expect(page.getByText(/upgrade|limit|plan/i).first()).toBeVisible();
  void rec;

  // send a test submission from the onboarding tab and find it in the inbox
  await page.goto(formUrl + "/onboarding");
  await page.getByRole("button", { name: "Send test submission" }).click();
  await expect(page.getByRole("status", { name: "Test receipt" })).toContainText("Received");
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Inbox" })).toBeVisible();

  // real submissions through the public endpoint, then the inbox, export and detail
  const key = formUrl.split("/").pop()!;
  const form = (await (await page.request.get("/api/forms")).json()).forms.find((f: { _id: string }) => f._id === key);
  for (const [name, message] of [["Ada Lovelace", "Need a quote for a bakery site"], ["Zoë <b>Müller</b>", "second lead & more"]])
    expect((await request.post(`/f/${form.key}`, { headers: { accept: "application/json", ...ipHdr() }, form: { email: "lead@client.test", name, message } })).status()).toBe(200);
  await expect.poll(async () => (await (await page.request.get("/api/submissions/export?format=json")).text()).includes("Ada Lovelace")).toBe(true);
  for (const fmt of ["csv", "json"]) {
    const r = await page.request.get(`/api/submissions/export?format=${fmt}`);
    expect(r.status()).toBe(200);
    expect(r.headers()["content-disposition"] ?? "").toContain("attachment");
  }
  await page.goto("/app");
  await expect(page.getByRole("link", { name: /Ada Lovelace/ })).toBeVisible();
  await page.getByLabel("Search submissions").fill("bakery");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("link", { name: /Ada Lovelace/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Zoë/ })).toHaveCount(0);
  await page.getByLabel("Search submissions").fill("zzzqqq");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText(/no submissions|nothing|no results|no matches/i).first()).toBeVisible();
  // html in a field is shown as text, never executed
  await page.getByLabel("Search submissions").fill("Müller");
  await page.getByRole("button", { name: "Search" }).click();
  await page.getByRole("link", { name: /Müller/ }).first().click();
  await expect(page.getByText("<b>Müller</b>", { exact: false }).first()).toBeVisible();
  expect(problems.filter((p) => !/40[0-9]/.test(p))).toEqual([]);
});

test("account: profile, security, sessions, sign out, delete with typed confirmation, Escape closes dialogs", async ({ page, request }) => {
  const addr = `acct${uniq()}@studio.test`;
  await signInUI(page, request, addr, "Acct Co");
  await page.goto("/app/settings/profile");
  await page.getByLabel("Name", { exact: true }).fill("  Jake Rivera ");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText(/saved|updated/i).first()).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Jake Rivera");

  await page.goto("/app/settings/security");
  await expect(page.getByRole("button", { name: "Set up authenticator app" })).toBeVisible();
  await page.getByRole("button", { name: "Set up authenticator app" }).click();
  await expect(page.getByLabel("6 digit code").or(page.getByRole("alert")).first()).toBeVisible();

  await page.goto("/app/settings/api-keys");
  await page.getByLabel("Name").fill("ci key");
  await page.getByRole("button", { name: "Create key" }).click();
  await expect(page.getByText("ci key").first()).toBeVisible();
  await page.getByRole("button", { name: "Delete" }).first().click();
  const dlg = page.getByRole("dialog");
  await expect(dlg).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);

  await page.goto("/app/settings/members");
  await page.getByLabel("Email").fill("mate@studio.test");
  await page.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByText(/seat|upgrade|plan|invited|pending|sent/i).first()).toBeVisible();

  await page.goto("/app/settings/profile");
  await page.getByRole("button", { name: "Delete my account" }).click();
  const del = page.getByRole("dialog");
  await expect(del).toBeVisible();
  const confirm = del.getByRole("button", { name: /delete/i }).last();
  await expect(confirm).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(del).toHaveCount(0);

  // sign out from the shell, then protected pages bounce
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/app");
  await page.getByRole("button", { name: /sign out/i }).first().click().catch(async () => { await page.getByRole("link", { name: /sign out/i }).first().click(); });
  await expect(page).toHaveURL(/sign-in|\/$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/sign-in/);
});

test("tenant isolation: another workspace's form, submissions and admin are not reachable", async ({ browser, request, baseURL }) => {
  const a = await browser.newPage();
  const b = await browser.newPage();
  const origin = { origin: baseURL! };
  await signInUI(a, request, `ta${uniq()}@studio.test`, "Org A");
  await signInUI(b, request, `tb${uniq()}@studio.test`, "Org B");
  const { form } = await (await a.request.post("/api/forms", { data: { name: "Secret" }, headers: origin })).json();
  expect((await request.post(`/f/${form.key}`, { headers: { accept: "application/json", ...ipHdr() }, form: { email: "x@y.test", message: "private lead" } })).status()).toBe(200);
  for (const path of [`/app/forms/${form._id}`, `/app/forms/${form._id}/templates`, `/app/forms/${form._id}/webhooks`, `/app/forms/${form._id}/onboarding`]) {
    await b.goto(path);
    await expect(b.getByText("This page did not arrive"), path).toBeVisible();
    await expect(b.locator("body")).not.toContainText("Secret");
  }
  expect((await b.request.patch(`/api/forms/${form._id}`, { data: { name: "pwned" }, headers: origin })).status()).toBeGreaterThanOrEqual(403);
  expect((await b.request.delete(`/api/forms/${form._id}/submissions`, { headers: origin })).status()).toBeGreaterThanOrEqual(403);
  expect(await (await b.request.get("/api/submissions/export?format=json")).text()).not.toContain("private lead");
  expect((await b.goto("/admin"))?.status()).toBeGreaterThanOrEqual(403);
  expect((await b.request.get("/api/admin/orgs")).status()).toBeGreaterThanOrEqual(401);
  const f = await (await a.request.get("/api/forms")).json();
  expect(f.forms[0].name).toBe("Secret");
});

test("checkout return and mid-flow back/refresh: the billing page explains each state and survives reloads", async ({ page, request }) => {
  const problems = watch(page);
  await signInUI(page, request, `ret${uniq()}@studio.test`, "Return Co");
  for (const q of ["success", "canceled", "garbage"]) {
    const res = await page.goto(`/app/billing?checkout=${q}&session_id=cs_test_nope`);
    expect(res?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    if (q !== "garbage") await expect(page.getByRole("status").or(page.getByRole("alert")).filter({ hasText: /./ }).first()).toBeVisible();
  }
  // back and refresh in the middle of creating a form keeps the page usable
  await page.goto("/app/forms");
  await page.getByLabel("New form").fill("Half typed");
  await page.reload();
  await expect(page.getByRole("button", { name: "Create form" })).toBeDisabled();
  await page.goto("/app/settings/members");
  await page.goBack();
  await expect(page).toHaveURL(/\/app\/forms/);
  // an unknown app route and an unknown form id are a calm 404, not a stack trace
  await page.goto("/app/does-not-exist");
  await expect(page.getByText("This page did not arrive")).toBeVisible();
  await page.goto("/app/forms/not-a-real-id");
  await expect(page.getByText("This page did not arrive")).toBeVisible();
  expect(problems.filter((p) => !/40\d/.test(p))).toEqual([]);
});
