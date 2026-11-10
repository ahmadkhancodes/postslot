import { expect, test } from "@playwright/test";

// Every signed-in /app route renders (no error boundary) with exactly one h1.
test("every /app route returns 200, has one h1, and no error boundary", async ({ page, request, baseURL }) => {
  const email = `routes+${Date.now()}@studio.test`;
  const origin = { origin: baseURL! };
  await page.request.post("/api/auth/sign-in/magic-link", { data: { email, callbackURL: "/app" }, headers: origin });
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  const org = await page.request.post("/api/auth/organization/create", { data: { name: "Route Crawl", slug: `crawl-${Date.now()}` }, headers: origin });
  await page.request.post("/api/auth/organization/set-active", { data: { organizationId: (await org.json()).id }, headers: origin });
  const created = await page.request.post("/api/forms", { data: { name: "Crawl form" }, headers: origin });
  expect(created.status()).toBe(201);
  const { form } = await created.json();

  const routes = [
    "/app", "/app/forms", "/app/usage", "/app/billing", "/app/domains",
    "/app/settings/profile", "/app/settings/members", "/app/settings/api-keys", "/app/settings/webhooks",
    "/app/settings/security", "/app/settings/audit",
    `/app/forms/${form._id}`, `/app/forms/${form._id}/webhooks`, `/app/forms/${form._id}/templates`, `/app/forms/${form._id}/onboarding`,
  ];
  for (const route of routes) {
    const res = await page.goto(route);
    expect(res?.status(), route).toBe(200);
    await expect(page.locator("h1"), `${route} h1 count`).toHaveCount(1);
    await expect(page.getByText("This page could not load"), route).toHaveCount(0);
  }
});
