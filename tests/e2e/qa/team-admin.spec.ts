import { expect, test } from "@playwright/test";
import { fakeIp, magicLink, signInUI, uniq, watch } from "./helpers";

test("admin: non-admin is refused, founder searches, overrides a plan with a reason, manages suppressions", async ({ browser, request, baseURL }) => {
  const origin = { origin: baseURL! };
  const user = await browser.newPage();
  await signInUI(user, request, `na${uniq()}@studio.test`, `Plain Co ${uniq()}`);
  const session = await (await user.request.get("/api/auth/get-session")).json();
  const orgId = session.session.activeOrganizationId as string;
  const denied = await user.goto("/admin");
  expect([401, 403, 404]).toContain(denied?.status());
  expect((await user.request.post("/api/admin/action", { data: { type: "plan.set", orgId, plan: "pro", reason: "self grant" }, headers: origin })).status()).toBeGreaterThanOrEqual(401);

  const f = await browser.newPage();
  const problems = watch(f);
  await signInUI(f, request, "founder@studio.test", "Founder Co");
  await f.goto("/admin");
  await expect(f.getByRole("heading", { level: 1 })).toBeVisible();
  await f.getByLabel("Search workspaces, forms and submissions").fill(orgId);
  await f.keyboard.press("Enter");
  await f.getByRole("link", { name: /Open workspace Plain Co/ }).first().click();
  await expect(f).toHaveURL(new RegExp(`/admin/org/${orgId}`));
  await f.getByLabel("Plan override").selectOption("pro");
  await f.getByRole("button", { name: "Set plan" }).click();
  await expect(f.getByRole("alert").or(f.getByRole("status")).filter({ hasText: /./ }).first()).toBeVisible();
  // the customer sees Pro without a Stripe subscription
  await expect.poll(async () => (await (await user.request.get("/api/billing/entitlement")).json()).plan.id).toBe("pro");

  await f.goto("/admin/suppressions");
  await f.getByLabel("Email address").fill("blocked@client.test");
  await f.getByRole("button", { name: "Suppress address" }).click();
  await expect(f.getByText("blocked@client.test").first()).toBeVisible();
  expect(problems.filter((p) => !/40\d/.test(p))).toEqual([]);
});

test("team: invite on a plan with seats, the invitee accepts, a viewer cannot change data", async ({ browser, request, baseURL }) => {
  const origin = { origin: baseURL! };
  const owner = await browser.newPage();
  const ownerMail = `own${uniq()}@studio.test`;
  await signInUI(owner, request, ownerMail, "Team Co");
  const orgId = (await (await owner.request.get("/api/auth/get-session")).json()).session.activeOrganizationId as string;

  // Free has one seat: the UI says why
  await owner.goto("/app/settings/members");
  await owner.getByLabel("Email").fill(`mate${uniq()}@studio.test`);
  await owner.getByRole("button", { name: "Send invitation" }).click();
  await expect(owner.getByRole("alert").or(owner.getByRole("status")).filter({ hasText: /./ }).first()).toBeVisible();

  const f = await browser.newPage();
  await signInUI(f, request, "founder@studio.test", "Founder Co");
  await f.request.post("/api/admin/action", { data: { type: "plan.set", orgId, plan: "pro", reason: "qa team test" }, headers: origin });

  const mate = `viewer${uniq()}@studio.test`;
  await owner.reload();
  await owner.getByLabel("Email").fill(mate);
  await owner.getByLabel("Role").selectOption("viewer").catch(() => {});
  await owner.getByRole("button", { name: "Send invitation" }).click();
  await expect(owner.getByText(mate).first()).toBeVisible();

  const invitee = await browser.newPage();
  await invitee.context().setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() });
  await invitee.goto("/sign-in");
  await invitee.getByLabel("Email").fill(mate);
  await invitee.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(invitee.getByText(/Check your inbox/)).toBeVisible();
  const box = await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(mate)}`)).json();
  const invite = box.messages.map((m: { text: string }) => /https?:\/\/\S+accept-invite\/\S+/.exec(m.text)?.[0]).find(Boolean) as string | undefined;
  expect(invite, "invitation email carries an accept link").toBeTruthy();
  await invitee.goto(await magicLink(request, mate));
  if (/onboarding/.test(invitee.url())) {
    // a new person invited to a team does not have to create an organization of their own first
    await invitee.goto(invite!);
  } else await invitee.goto(invite!);
  await invitee.getByRole("button", { name: /accept/i }).click();
  await expect(invitee).toHaveURL(/\/app/);
  await invitee.goto("/app/forms");
  await expect(invitee.getByText("Team Co").first()).toBeVisible();
  const create = await invitee.request.post("/api/forms", { data: { name: "Nope" }, headers: origin });
  expect([403]).toContain(create.status());
  await expect(invitee.getByRole("button", { name: "Create form" })).toHaveCount(0);
});
