import { expect, test, type APIRequestContext } from "@playwright/test";
import Stripe from "stripe";
import { product } from "../../../src/config/product";
import { signInUI, uniq, watch } from "../qa/helpers";

// The upgrade journey end to end, as far as Stripe test mode goes without card entry. The app instance on :3101 talks to a
// local Stripe stand-in (tests/e2e/billing/fake-stripe.mjs); the test plays Stripe's part after the card form: it marks the
// session paid, then posts the signed webhook events Stripe would send.
const APP = "http://localhost:3101";
const STRIPE = "http://localhost:3199";
const WHSEC = "whsec_postslot_e2e";

test.skip(!!process.env.BASE_URL, "needs the local app instance wired to the Stripe stand-in");
test.use({ baseURL: APP });

type State = { sessions: Record<string, any>[]; portals: Record<string, any>[]; requests: { method: string; path: string; query: any }[] };
const state = async (r: APIRequestContext): Promise<State> => (await r.get(`${STRIPE}/_test/state`)).json();

let n = 0;
async function stripeEvent(r: APIRequestContext, type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({ id: `evt_e2e_${Date.now()}_${n++}`, object: "event", type, api_version: "2025-01-27.acacia", created: Math.floor(Date.now() / 1000), data: { object } });
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: WHSEC });
  return r.post(`${APP}/api/stripe/webhook`, { headers: { "stripe-signature": signature, "content-type": "application/json" }, data: payload });
}

test("upgrade: plan choice opens the right Checkout Session, the webhook unlocks Pro, the portal opens, cancelling goes back to Free", async ({ page, request }) => {
  test.setTimeout(120_000);
  const problems = watch(page);
  const email = `payer${uniq()}@studio.test`;
  await signInUI(page, request, email, "Paying Studio");
  const orgId = (await (await page.request.get("/api/auth/get-session")).json()).session.activeOrganizationId as string;

  // Free to start: limits are the Free plan's.
  const free = product.plans.find((p) => p.id === "free")!;
  const pro = product.plans.find((p) => p.id === "pro")!;
  await page.goto("/app/billing");
  await expect(page.getByText(`0 of ${free.limits.submissions.toLocaleString("en-US")}`).first()).toBeVisible();

  // Cancel at Checkout: back on billing, told nothing was charged.
  await page.getByRole("button", { name: "Monthly" }).click();
  await page.getByRole("button", { name: pro.cta }).click();
  await page.waitForURL(`${STRIPE}/checkout/**`);
  let s = await state(request);
  const first = s.sessions.at(-1)!;
  await page.goto(first.cancel_url);
  await expect(page.getByText("Checkout canceled")).toBeVisible();
  await expect(page.getByText("Nothing was charged")).toBeVisible();

  // Choose Pro yearly (the default interval) from the pricing page hand-off.
  await page.goto("/app/billing?plan=pro&interval=year");
  await page.getByRole("button", { name: "Continue to checkout" }).click();
  await page.waitForURL(`${STRIPE}/checkout/**`);
  s = await state(request);
  const session = s.sessions.at(-1)!;
  const yearly = pro.prices.find((p) => p.interval === "year")!;
  expect(session.mode).toBe("subscription");
  expect(session.line_items["0"]).toEqual({ price: `price_${yearly.lookupKey}`, quantity: "1" });
  expect(yearly.lookupKey).toBe("postslot_pro_annual");
  expect(session.metadata).toMatchObject({ app: "postslot", plan: "pro", interval: "year", org_id: orgId });
  expect(session.subscription_data.metadata).toMatchObject({ app: "postslot", plan: "pro", org_id: orgId });
  expect(session.client_reference_id).toBe(orgId);
  expect(session.success_url).toBe(`${APP}/app/billing?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  expect(session.cancel_url).toBe(`${APP}/app/billing?checkout=canceled`);
  // The price lookup asked only for this app's keys, and the customer is tagged with the app too.
  const lookup = s.requests.filter((r) => r.path === "/v1/prices").at(-1)!;
  expect(Object.values(lookup.query.lookup_keys).every((k) => String(k).startsWith("postslot_"))).toBe(true);
  const customer = (await (await request.get(`${STRIPE}/_test/state`)).json()).customers[session.customer];
  expect(customer.metadata).toMatchObject({ app: "postslot", org_id: orgId });

  // Stripe takes the card (not testable without card entry); the stand-in marks the session paid.
  const paid = await (await request.post(`${STRIPE}/_test/pay`, { data: { session: session.id } })).json();
  const bad = await request.post(`${APP}/api/stripe/webhook`, { headers: { "stripe-signature": "t=1,v1=bad" }, data: "{}" });
  expect(bad.status(), "unsigned webhook refused").toBe(400);
  const hook = await stripeEvent(request, "checkout.session.completed", { ...paid.session, object: "checkout.session" });
  expect(hook.status()).toBe(200);

  // Back on the success URL the plan is active and the limits are Pro's.
  await page.goto(session.success_url.replace("{CHECKOUT_SESSION_ID}", session.id));
  await expect(page.getByText("Your plan is active")).toBeVisible();
  await expect(page.getByText(`You are now on ${pro.name}`)).toBeVisible();
  await page.goto("/app/billing");
  await expect(page.getByText(`0 of ${pro.limits.submissions.toLocaleString("en-US")}`).first()).toBeVisible();
  const ent = await (await page.request.get("/api/billing/entitlement")).json();
  expect(ent.plan.id).toBe("pro");
  expect(ent.usage.find((u: { meter: string }) => u.meter === "recipients").limit).toBe(pro.limits.recipients);

  // Manage billing opens the Stripe portal for this customer and comes back to billing.
  await page.getByRole("button", { name: "Manage billing" }).click();
  await page.waitForURL(`${STRIPE}/portal/**`);
  const portal = (await state(request)).portals.at(-1)!;
  expect(portal.customer).toBe(session.customer);
  expect(portal.return_url).toBe(`${APP}/app/billing`);

  // Cancel in the portal: first "at period end" (Pro kept until then), then Stripe ends it (Free again).
  const sub = paid.subscription;
  await request.post(`${STRIPE}/_test/update`, { data: { subscription: sub.id, patch: { cancel_at_period_end: true } } });
  expect((await stripeEvent(request, "customer.subscription.updated", { ...sub, cancel_at_period_end: true })).status()).toBe(200);
  await page.goto("/app/billing");
  await expect(page.getByText("Your subscription is set to cancel")).toBeVisible();
  await expect(page.getByText("Ends on")).toBeVisible();

  await request.post(`${STRIPE}/_test/update`, { data: { subscription: sub.id, patch: { status: "canceled" } } });
  expect((await stripeEvent(request, "customer.subscription.deleted", { ...sub, status: "canceled" })).status()).toBe(200);
  await page.goto("/app/billing");
  await expect(page.getByText(`0 of ${free.limits.submissions.toLocaleString("en-US")}`).first()).toBeVisible();
  expect((await (await page.request.get("/api/billing/entitlement")).json()).plan.id).toBe("free");
  await expect(page.getByRole("button", { name: pro.cta })).toBeEnabled();

  expect(problems).toEqual([]);
});
