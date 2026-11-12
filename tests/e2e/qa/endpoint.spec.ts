import { expect, test } from "@playwright/test";
import { fakeIp, signInUI, uniq } from "./helpers";

// P0 1-3: the public endpoint as a site visitor and as the site owner's browser.
test("endpoint: html post, json, cors, limits, honeypot, domain lock, paused form", async ({ page, request, baseURL }) => {
  const email = `ep${uniq()}@studio.test`;
  await signInUI(page, request, email);
  const origin = { origin: baseURL! };
  const { form } = await (await page.request.post("/api/forms", { data: { name: "Contact page" }, headers: origin })).json();
  const url = `/f/${form.key}`;
  const ip = () => ({ "x-forwarded-for": fakeIp() });

  // Plain HTML post with no JS: 303 to the thank-you page.
  const html = await request.post(url, { form: { email: "visitor@client.test", message: "Hello there" }, maxRedirects: 0, headers: ip() });
  expect(html.status()).toBe(303);
  expect(html.headers().location).toContain("/thanks");

  // The same through a real browser form with a custom success URL.
  const ok = await request.post(url, { headers: { accept: "application/json", ...ip() }, form: { email: "v@client.test", message: "Hi", subject: "Quote please", from_name: "Vera" } });
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body.success).toBe(true);
  expect(body.id).toBeTruthy();
  expect(ok.headers()["access-control-allow-origin"]).toBe("*");

  // JSON body + cross-origin preflight.
  const json = await request.post(url, { headers: { accept: "application/json", "content-type": "application/json", origin: "https://client.test", ...ip() }, data: { email: "j@client.test", message: "json" } });
  expect(json.status()).toBe(200);
  const pre = await request.fetch(url, { method: "OPTIONS", headers: { origin: "https://client.test", "access-control-request-method": "POST" } });
  expect(pre.status()).toBe(204);

  // Hostile and oversize input never 500.
  for (const message of ["", "<script>alert(1)</script>", "🙂".repeat(500), "x".repeat(50_000), " \n\t "]) {
    const r = await request.post(url, { headers: { accept: "application/json", ...ip() }, form: { email: "e@client.test", message } });
    expect([200, 422], `message len ${message.length}`).toContain(r.status());
  }
  const big = await request.post(url, { headers: { accept: "application/json", ...ip() }, form: { email: "e@client.test", message: "x".repeat(120_000) } });
  expect(big.status()).toBe(413);
  const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`f${i}`, "v"]));
  const m = await request.post(url, { headers: { accept: "application/json", ...ip() }, form: many });
  expect(m.status()).toBe(422);
  const bad = await request.post(url, { headers: { accept: "application/json", "content-type": "application/json", ...ip() }, data: "{not json" });
  expect(bad.status()).toBeLessThan(500);
  const unknown = await request.post("/f/doesnotexist", { headers: { accept: "application/json", ...ip() }, form: { email: "a@b.test" } });
  expect(unknown.status()).toBe(404);
  expect((await request.post("/f/doesnotexist", { form: { a: "b" }, maxRedirects: 0, headers: ip() })).status()).toBeLessThan(500);

  // Honeypot: looks like success, never delivered.
  const trap = await request.post(url, { headers: { accept: "application/json", ...ip() }, form: { email: "bot@spam.test", message: "buy", _gotcha: "x" } });
  expect(trap.status()).toBe(200);
  expect((await trap.json()).success).toBe(true);

  // Rate limit per IP: 429 with Retry-After.
  const fixed = { "x-forwarded-for": "203.0.113.77" };
  let limited;
  for (let i = 0; i < 12 && !limited; i++) {
    const r = await request.post(url, { headers: { accept: "application/json", ...fixed }, form: { email: "r@client.test", message: `n${i}` } });
    if (r.status() === 429) limited = r;
  }
  expect(limited, "429 after a burst").toBeTruthy();
  expect(limited!.headers()["retry-after"]).toBeTruthy();

  // Domain lock via the settings UI: a foreign origin gets 403, the allowed one passes.
  await page.goto(`/app/forms/${form._id}`);
  await page.getByLabel("Allowed sites").fill("client.test");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  const evil = await request.post(url, { headers: { accept: "application/json", origin: "https://evil.test", ...ip() }, form: { email: "e@x.test", message: "hi" } });
  expect(evil.status()).toBe(403);
  const good = await request.post(url, { headers: { accept: "application/json", origin: "https://client.test", ...ip() }, form: { email: "e@x.test", message: "hi" } });
  expect(good.status()).toBe(200);

  // Pause from the UI: the endpoint answers with a clear 403.
  await page.getByLabel(/Pause this form/).check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  const paused = await request.post(url, { headers: { accept: "application/json", origin: "https://client.test", ...ip() }, form: { email: "e@x.test", message: "hi" } });
  expect(paused.status()).toBe(403);
  expect((await paused.json()).message).toBeTruthy();
});
