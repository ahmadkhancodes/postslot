import { expect, test } from "@playwright/test";

// M3 pages: email templates with live preview, the field linter and test submission, webhooks plan gate.
test("templates preview, linter, test submission and webhook gate", async ({ page, request, baseURL }) => {
  const email = `m3+${Date.now()}@studio.test`;
  const origin = { origin: baseURL! };
  await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Harbor Studio", slug: `m3-${Date.now()}` }, headers: origin });
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: (await org.json()).id }, headers: origin });
  const { form } = await (await page.request.post("/api/forms", { data: { name: "Contact page" }, headers: origin })).json();
  const shots = (name: string) => page.screenshot({ path: `docs/qa/m3/${name}.png`, fullPage: true });

  // Templates: the preview comes from the server renderer.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/app/forms/${form._id}/templates`);
  await expect(page.getByRole("heading", { name: "Template", exact: true })).toBeVisible();
  await expect(page.getByTestId("preview-subject")).toHaveText("New submission on Contact page");
  await expect(page.locator("iframe[title='Email preview']")).toBeVisible();
  await page.getByLabel("Email subject").fill("New message from {{name}}");
  await expect(page.getByTestId("preview-subject")).toHaveText("New message from Mara Okafor");
  await shots("templates-1440-light");
  await page.getByLabel(/Plain text/).check();
  await expect(page.getByTestId("preview-text")).toContainText("name: Mara Okafor");
  await expect(page.locator("iframe[title='Email preview']")).toHaveCount(0);
  await page.getByRole("button", { name: "Save template" }).click();
  await expect(page.getByText("Saved. New submissions use this template.")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(/Plain text/)).toBeChecked();

  // Onboarding: linter flags a broken snippet, then a test submission returns a receipt.
  await page.goto(`/app/forms/${form._id}/onboarding`);
  await page.getByLabel("Your form HTML").fill('<form><input type="email"><textarea name="message"></textarea></form>');
  await page.getByRole("button", { name: "Check form" }).click();
  const results = page.getByRole("list", { name: "Linter results" });
  await expect(results).toContainText("no action attribute");
  await expect(results).toContainText("which Postslot does not accept");
  await expect(results).toContainText("has no name attribute");
  await expect(results).toContainText("No honeypot");
  await shots("onboarding-1440-light");
  await page.getByRole("button", { name: "Send test submission" }).click();
  const receipt = page.getByRole("status", { name: "Test receipt" });
  await expect(receipt).toContainText("Received");
  await expect(receipt).toContainText("Dispatched");
  await expect(receipt).toContainText(email);

  // The test is in the inbox, labelled in the email and not on the meter.
  const msgs = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  expect(msgs.messages.at(-1).subject).toContain("[Test]");

  // Mobile.
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto(`/app/forms/${form._id}/templates`);
  await expect(page.getByTestId("preview-subject")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shots("templates-375-light");
  await page.goto(`/app/forms/${form._id}/onboarding`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await shots("onboarding-375-light");

  // Webhooks are Starter and above; Free sees the upgrade notice, the API says plan_required.
  await page.goto(`/app/forms/${form._id}/webhooks`);
  await expect(page.getByText("Webhooks are on Starter and above")).toBeVisible();
  const denied = await page.request.post(`/api/forms/${form._id}/webhooks`, { data: { url: "https://hooks.example.com/x", events: ["submission.received"] }, headers: origin });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).error).toBe("plan_required");
});
