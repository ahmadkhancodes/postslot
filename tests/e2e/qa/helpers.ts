import { expect, type Page, type APIRequestContext } from "@playwright/test";

let ipn = Math.floor(Math.random() * 200);
export const fakeIp = () => `10.${Math.floor(Math.random() * 250)}.${ipn++ % 250}.${1 + Math.floor(Math.random() * 250)}`;
export const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`;

/** Sign in through the real sign-in form and the e-mail outbox, finishing on the org onboarding screen. */
export async function signInUI(page: Page, request: APIRequestContext, email: string, orgName = "Harbor Studio") {
  // Better Auth rate limits sign-in per IP (3 per 10 s); every test gets its own pretend client IP.
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() });
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText(`Check your inbox at ${email}`)).toBeVisible();
  const link = await magicLink(request, email);
  await page.goto(link);
  if (orgName) {
    await expect(page).toHaveURL(/\/onboarding|\/app/);
  }
  if (orgName && /\/onboarding/.test(page.url())) {
    await page.getByLabel(/name/i).first().fill(orgName);
    await page.getByRole("button", { name: /create/i }).click();
    await expect(page).toHaveURL(/\/app/);
  }
}

export async function magicLink(request: APIRequestContext, email: string) {
  let link: string | undefined;
  await expect.poll(async () => {
    const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
    link = /https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1)?.text ?? "")?.[0];
    return link;
  }, { message: "magic link in outbox" }).toBeTruthy();
  return link!;
}

/** Collect console errors, page errors and failed/4xx-5xx same-origin requests. */
export function watch(page: Page) {
  const problems: string[] = [];
  const noise = (t: string) => /_vercel\/insights|ERR_ABORTED|ERR_SSL_PROTOCOL_ERROR|_rsc=|status of 404 \(Not Found\)/.test(t);
  page.on("console", (m) => { if (noise(m.text())) return; if (m.type() === "error" || /hydrat/i.test(m.text())) problems.push(`console: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push(`pageerror: ${page.url()} ${e.message.slice(0, 80)}`));
  page.on("requestfailed", (r) => noise(r.url() + r.failure()?.errorText) || problems.push(`failed: ${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => { if (r.status() >= 500) problems.push(`${r.status()} ${r.url()}`); });
  return problems;
}
