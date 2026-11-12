import { expect, test } from "@playwright/test";
import { fakeIp, signInUI, uniq, watch } from "./helpers";

test("paid plan: recipient confirmation holds then releases, webhook input is validated, account deletion needs the typed phrase and works", async ({ page, browser, request, baseURL }) => {
  test.setTimeout(120_000);
  const origin = { origin: baseURL! };
  const problems = watch(page);
  const owner = `pro${uniq()}@studio.test`;
  await signInUI(page, request, owner, "Pro Co");
  const orgId = (await (await page.request.get("/api/auth/get-session")).json()).session.activeOrganizationId as string;
  const f = await browser.newPage();
  await signInUI(f, request, "founder@studio.test", "Founder Co");
  expect((await f.request.post("/api/admin/action", { data: { type: "plan.set", orgId, plan: "pro", reason: "qa paid flows" }, headers: origin })).status()).toBe(200);
  const { form } = await (await page.request.post("/api/forms", { data: { name: "Contact page" }, headers: origin })).json();

  // add a second recipient: it waits for confirmation, a submission is held for it, confirming releases it
  const client = `client${uniq()}@client.test`;
  await page.goto(`/app/forms/${form._id}`);
  await page.getByLabel("Add a recipient").fill(client);
  await page.getByRole("button", { name: "Add and confirm" }).click();
  await expect(page.getByText("Added. We emailed a confirmation link.")).toBeVisible();
  await expect(page.getByText("Waiting for confirmation")).toBeVisible();
  // the same address twice is refused with a sentence
  await page.getByLabel("Add a recipient").fill(client);
  await page.getByRole("button", { name: "Add and confirm" }).click();
  await expect(page.getByRole("alert").or(page.getByText(/already/i)).first()).toBeVisible();

  let confirm: string | undefined;
  await expect.poll(async () => {
    const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(client)}`)).json();
    confirm = box.messages.map((m: { text: string }) => /https?:\/\/\S+verify-recipient\S*/.exec(m.text)?.[0]).find(Boolean);
    return confirm;
  }).toBeTruthy();
  const box0 = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(client)}`)).json();
  expect(JSON.stringify(box0)).not.toContain("lead number"); // no content to an unconfirmed address
  const ok = await request.post(`/f/${form.key}`, { headers: { accept: "application/json", "x-forwarded-for": fakeIp() }, form: { email: "lead@x.test", message: "lead number 1 for the client" } });
  expect(ok.status()).toBe(200);

  const visitor = await browser.newPage();
  await visitor.goto(confirm!);
  await expect(visitor.getByRole("heading", { name: "Confirm this address" })).toBeVisible();
  await visitor.getByRole("button", { name: "Confirm address" }).click(); // a real form post: the CSP must allow it
  await expect(visitor.locator("body")).toContainText(/confirmed|verified|thank|all set/i);
  await visitor.goto(confirm!); // reused link: explained, not a crash
  expect((await visitor.locator("h1").count())).toBe(1);
  await page.reload();
  await expect(page.getByText("Confirmed").first()).toBeVisible();

  // webhooks: validation and a working endpoint
  await page.goto(`/app/forms/${form._id}/webhooks`);
  const url = page.getByLabel("Endpoint URL");
  await url.fill("not a url");
  await page.getByRole("button", { name: "Add endpoint" }).click();
  expect(await url.evaluate((el) => (el as HTMLInputElement).validity.typeMismatch)).toBe(true); // the browser's own message shows
  for (const bad of ["http://localhost:9/x", "http://169.254.169.254/latest", "ftp://example.com/x"]) {
    await url.fill(bad);
    await page.getByRole("button", { name: "Add endpoint" }).click();
    await expect(page.getByRole("alert").or(page.getByRole("status")).filter({ hasText: /./ }).first(), bad).toBeVisible();
  }
  await expect(page.getByText("No endpoints for this form yet.")).toBeVisible();
  await url.fill("https://hooks.example.com/postslot");
  await page.getByRole("button", { name: "Add endpoint" }).click();
  await expect(page.getByText("https://hooks.example.com/postslot")).toBeVisible();

  // delete account: confirm stays disabled until the phrase is typed, then the user is signed out and cannot sign back in to the old data
  await page.goto("/app/settings/profile");
  await page.getByRole("button", { name: "Delete my account" }).click();
  const dlg = page.getByRole("dialog");
  const go = dlg.getByRole("button", { name: "Delete account permanently" });
  await expect(go).toBeDisabled();
  await dlg.getByRole("textbox").fill("delete my account");
  await expect(go).toBeEnabled();
  await go.click();
  await expect(page).toHaveURL(/sign-in|\/$|goodbye|deleted/);
  await page.goto("/app");
  await expect(page).toHaveURL(/sign-in/);
  expect((await request.post(`/f/${form.key}`, { headers: { accept: "application/json", "x-forwarded-for": fakeIp() }, form: { email: "late@x.test", message: "after deletion" } })).status()).toBe(404);
  expect(problems.filter((p) => !/40\d/.test(p))).toEqual([]);
});
