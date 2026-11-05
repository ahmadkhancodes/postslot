# ROADMAP: Postslot by BufferSol

P-numbers are the P0 items of `docs/brief.md` (MVP scope). Detail and acceptance criteria per item are in `docs/ARCHITECTURE.md` (same section order). Every milestone ends with the Definition of done in `CLAUDE.md`: lint, typecheck, tests, build green; deployed; Playwright screenshots (375/1440, light/dark) in `docs/qa/`; `docs/PROGRESS.md` updated; PR merged.

Gate before M1 UI: the orchestrator approves `docs/DESIGN.md` and `docs/design/mock.html`.

## M1: Marketing, accounts, billing, deploy (P10, P9 plumbing, P12)
- [ ] Apply DESIGN.md tokens to `src/app/globals.css` (`:root` blocks only) and Geist in `fonts.ts`.
- [ ] Landing per `docs/SECTION_PLAN.md` with the real `InboxPreview` hero component and the postmark.
- [ ] Pricing from `product.ts`, annual default; compare pages `/compare/web3forms` and `/compare/formspree`; FAQ; legal pages filled.
- [ ] Auth (kit): magic link, passkey, TOTP, org; account deletion and export extended to Postslot collections later in M2.
- [ ] Billing (kit) live in Stripe test mode: Checkout, portal, webhook endpoint, `STRIPE_WEBHOOK_SECRET`.
- [ ] Mongo live (`MONGODB_URI`, `npm run db:indexes`); mail provider key; deploy with `scripts/deploy.sh postslot`; keep latest 3 deployments.
- [ ] llms.txt and the first docs pages (getting started, endpoint reference).

## M2: Ingest and spam (P1, P2, P3)
- [x] `forms` CRUD, form key, recipients and verification email.
- [x] `/f/:key` endpoint with all special fields, size limits, CORS, redirect/JSON modes.
- [x] Edge layers: honeypot, time token + `ps.js`, ALTCHA, domain lock, rate limits.
- [x] Rules engine, token Bayes, quarantine, "Not spam" release, `sender_allow`.
- [x] Tests per signal; e2e for the plain HTML form and cross-origin fetch.
- [x] Usage meters: legit/spam/held (no soft cap enforcement yet).

## M3: Delivery and bounces (P4, P5, P6)
- [ ] `Mailer` event interface, provider adapter, `/api/hooks/mail` with signature check and idempotency.
- [ ] Dispatch, deliveries, delivery events, timeline composition, postmark states.
- [ ] Templates (default, compact, plain), subject variables, preview parity test.
- [ ] Bounce classification, suppressions scoped per org, banner, owner alerts, unsuppress and redeliver with the 3 per day cap.
- [ ] Complaint handling (provider event now, FBL on the VPS later).
- [ ] Honesty gate flag `own_mta_live` wired into copy.

## M4: Inbox, onboarding, soft cap, admin (P7, P8, P9, P11)
- [ ] Inbox list, filters, search, detail view, export CSV/JSON, retention and purge cron.
- [ ] Search benchmark on 100k rows.
- [ ] Snippet picker (HTML, React, Next.js, Astro, Vue, Svelte, Webflow, Framer, WordPress, 4 AI builder prompts), field name linter, "Send test submission", 10 minute troubleshooting email.
- [ ] Soft cap hold and release, 80%/100% notices, usage meter UI.
- [ ] Founder admin: workspace search, abuse flags, suspend form, plan override, suppression list, audit; canary cron, `/status`.

## M5: QA, hardening, launch readiness (P12 and all)
- [ ] Playwright screenshots for every route at 375 and 1440, light and dark; axe pass; Lighthouse 90+.
- [ ] Design scorecard, palette distinctness re-check against sibling products.
- [ ] k6 ingest load test at 200 rps on a preview deploy; p95 under 150 ms for the edge path.
- [ ] Security pass: CSP, open redirect checks, SSRF review for redirect/webhooks, escape review for email templates, IP hash pepper rotation.
- [ ] AI builder prompts and llms.txt re-tested; framework guides first batch; "Is my form sending?" checker spec.
- [ ] Launch checklist: Vercel Pro (manual), real Stripe keys (manual), domain DNS (manual), `own_mta_live` stays off until the VPS MTA passes the deliverability ACs.

## After M5 (not in this MVP)
P1 from the brief in order: server-to-server tokens, customer captcha keys, custom sending domain, autoresponder, file uploads, webhooks/integrations, REST API, team seats; then the VPS move (own MTA, warm-up, FBL) behind the existing interfaces.

## P0 coverage map
| Brief P0 | Milestone |
|---|---|
| 1 Endpoint | M2 |
| 2 Spam edge layers | M2 |
| 3 Spam content, quarantine | M2 |
| 4 Delivery | M3 (provider now; deliverability ACs at VPS) |
| 5 Bounces and complaints | M3 |
| 6 Templates | M3 |
| 7 Inbox, search, export, retention | M4 |
| 8 Onboarding | M4 |
| 9 Billing, soft cap | M1 plumbing, M4 soft cap |
| 10 Account | M1 (kit) |
| 11 Admin and Ops | M4, status page hardening M5 |
| 12 Distribution (AI prompts, llms.txt) | M1 start, M4 prompts, M5 retest |
