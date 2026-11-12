import { defineConfig } from "@playwright/test";

const PORT = 3100;
const BILLING_PORT = 3101;
const FAKE_STRIPE_PORT = 3199;
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  // One worker: every spec signs in from the same address and Better Auth rate limits sign-in per IP.
  workers: 1,
  use: {
    baseURL: process.env.BASE_URL ?? `http://localhost:${PORT}`,
    // Runners without Playwright's browser download can point at a system Chromium: PW_CHROMIUM=/usr/bin/chromium
    ...(process.env.PW_CHROMIUM ? { launchOptions: { executablePath: process.env.PW_CHROMIUM, args: ["--no-sandbox"] } } : {}),
  },
  webServer: process.env.BASE_URL
    ? undefined
    : [
        {
          command: `npx next start -p ${PORT}`,
          port: PORT,
          reuseExistingServer: true,
          env: { DB_DRIVER: "memory", E2E_OUTBOX: "1", NEXT_PUBLIC_APP_URL: `http://localhost:${PORT}`, MAIL_PROVIDER: "console", BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0000", CRON_SECRET: "e2e-cron", ADMIN_EMAILS: "founder@studio.test,sec-founder@studio.test" },
        },
        // Billing journey (tests/e2e/billing): a second app instance wired to a local Stripe stand-in, so the specs above keep
        // testing "billing not connected" while this one walks Checkout, webhook, portal and cancellation.
        { command: `node tests/e2e/billing/fake-stripe.mjs`, port: FAKE_STRIPE_PORT, reuseExistingServer: true, env: { FAKE_STRIPE_PORT: String(FAKE_STRIPE_PORT) } },
        {
          command: `npx next start -p ${BILLING_PORT}`,
          port: BILLING_PORT,
          reuseExistingServer: true,
          env: {
            DB_DRIVER: "memory", E2E_OUTBOX: "1", NEXT_PUBLIC_APP_URL: `http://localhost:${BILLING_PORT}`, MAIL_PROVIDER: "console",
            BETTER_AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-0000", CRON_SECRET: "e2e-cron",
            STRIPE_SECRET_KEY: "sk_test_postslot_e2e_stand_in", STRIPE_WEBHOOK_SECRET: "whsec_postslot_e2e", STRIPE_API_BASE: `http://localhost:${FAKE_STRIPE_PORT}`,
          },
        },
      ],
});
