# Progress: Postslot by BufferSol

## State (5 Nov 2026, end of day)
- **Phase K done.** Universal kit merged to main (PR #1, PR #2) and tagged **`kit-v1`** (main @ 35bdaa5). Product sessions copy it via KIT_COPY.md.
- Checks on main: CI green (lint, typecheck, 45 unit tests, build); 2 Playwright e2e pass locally (memory driver).
- Live (stub mode): https://postslot.vercel.app on the NEW Vercel account (team ahmad-code `team_rbOXRpz6zmliuGsw8eIh3YDw`, project `prj_jEqPLNHNoqUT59IUuLFNsp2EbIbh`). Env set: APP_NAME, NEXT_PUBLIC_APP_URL, MAIL_PROVIDER=console, MAIL_CONSOLE_PRINT=1, ADMIN_EMAILS, BETTER_AUTH_SECRET, CRON_SECRET, ALTCHA_HMAC_KEY.
- Stripe test catalogue created (docs/STRIPE.md). No webhook endpoint yet (needs the key + Mongo first).
- **Mongo URI pending**: Atlas user `postslot-app` waits on Ahmad's interactive approval. On the memory driver the live magic link fails (INVALID_TOKEN: serverless instances don't share memory). Locally the full flow passes.
- **Phase 0 WIP** on branch `phase0-design` (draft PR "WIP: Postslot Phase 0 design"): `docs/DESIGN.md` (complete draft: postmark vermilion #B93F17 action, berry #A3134A danger, cool neutral ramp, tokens mapped 1:1 to globals.css) and `docs/SECTION_PLAN.md` (draft). Missing: ARCHITECTURE.md, ROADMAP.md, docs/design/mock.html + 4 PNGs, docs/design-qa.md.

## 5 Nov 2026 (later): Phase 0 finished, awaiting design approval
- Docs complete: DESIGN.md (palette changed to violet, see D-P1), SECTION_PLAN.md, ARCHITECTURE.md (all 12 P0s, data model, acceptance criteria), ROADMAP.md (M1 to M5).
- Mock: docs/design/mock.html + mock-1440.png, mock-375.png, mock-1440-dark.png (hero with real inbox UI + submissions inbox screen). No src/ changes. Not done: docs/design-qa.md scorecard, 375 dark shot.
- **Next: orchestrator reviews the design. No product UI until approved**, then M1.

## Earlier next steps (steps 1 to 4 done)
1. Check out `phase0-design`. Review docs/DESIGN.md + docs/SECTION_PLAN.md against docs/factory/DESIGN_PLAYBOOK.md and the palette registry (no green/teal/navy/amber); fix anything off.
2. Write docs/ARCHITECTURE.md (Vercel adaptation, data model with Date TTLs, every P0 in docs/brief.md with acceptance criteria, API surface, soft cap + held submissions, VPS later list) and docs/ROADMAP.md (M1 to M5 checklists).
3. Build docs/design/mock.html (hero with real submissions inbox + one app screen, DESIGN.md tokens, light/dark) and screenshot it at 1440 and 375, light and dark (docs/design/mock-*.png); self-score in docs/design-qa.md (>= 40/50, no hard fails).
4. Send the orchestrator a short design summary + PR link; WAIT for design approval before product UI.
5. If MONGODB_URI / STRIPE_SECRET_KEY_TEST have arrived: set them in Vercel (`MONGODB_URI`, `MONGODB_DB=postslot`, `STRIPE_SECRET_KEY`, flip `DB_DRIVER` unset), run `npm run db:indexes`, create the Stripe webhook endpoint `https://postslot.vercel.app/api/stripe/webhook` (events in docs/STRIPE.md) and set `STRIPE_WEBHOOK_SECRET`, redeploy with `scripts/deploy.sh postslot`, verify live: magic link -> org -> checkout (4242 card) -> plan active -> portal.
6. After approval: M1 (apply DESIGN.md tokens/fonts, real landing, pricing, auth, billing, legal, deploy), then M2 to M4 P0s, M5 QA. Use Sonnet subagents for chunks.

## Notes for a fresh session
- Deploy ONLY with VERCEL_TOKEN_NEW_ACCOUNT via `scripts/deploy.sh` (the Vercel MCP connector is the OLD account).
- Session git proxy blocks tag pushes: use the "Create tag" workflow (`.github/workflows/tag.yml`).
- Disabling Vercel deployment protection via API was denied by the permission classifier; not needed (production alias is public).

## 5 Nov 2026 (M1 code done, deploy pending)
- M1 storefront built on the kit, per approved design: violet tokens + Geist in globals.css/fonts.ts, plans and meter in product.ts, landing (hero inbox with postmark receipt, stat strip, explainer + install snippet, bento, steps, tagline, comparison, pricing, FAQ), `/pricing` (annual default, add ons, dated Web3Forms line), `/compare/web3forms`, docs install snippets + llms.txt, legal pass.
- QA: screenshots in docs/qa/m1/, scorecard docs/design-qa.md (44/50), no horizontal overflow. lint, typecheck, 45 unit tests, build and Playwright e2e green.
- Manual: legal placeholders listed in docs/MANUAL_STEPS.md item 3.
- **NOT deployed** (per task). Next: deploy via scripts/deploy.sh, then M2 per docs/ROADMAP.md (form ingest `/f/<form_key>`, inbox, receipts).

## 5 Nov 2026 (M2 code done, not deployed)
- **M2 built on the kit, per ARCHITECTURE sections 2 to 6 and the approved mock.** `POST /f/:key` (urlencoded, multipart, JSON; 303 or JSON; CORS; 100 KB / 25 field limits; origin lock; rate limits 5/min per IP hash and 120/min per form), `ps.js` + signed time token, honeypot, ALTCHA when enabled, rules engine, in-house Bayes, signals stored on every submission. Spam never counts; over-limit submissions are held and released on month reset, upgrade (Stripe webhook) or the cron.
- **Delivery:** recipient verification first (unverified gets no content), `Mailer` dispatch with Reply-To, `MailEvent` interface + Resend/Svix source at `POST /api/hooks/mail` (`MAIL_WEBHOOK_SECRET`), hard bounce and complaint suppression per org, retries with backoff in cron job `deliver-pending`, per-submission receipt (Received, Sorted, Dispatched, Deferred/Accepted/Returned) stored as `delivery_events`.
- **UI:** `/app` inbox (list, detail, receipt with postmark, filters, search, Not spam, Mark spam, Redeliver, CSV export), `/app/forms` (create) and `/app/forms/[id]` (install snippet picker, recipients with confirm/resend/allow again, settings), `/thanks`, `/verify-recipient`.
- **Data:** `Db.docs()` DocStore on memory and Mongo (contract tests for both); indexes added to `npm run db:indexes` (run it once Mongo is live); org export/delete cover the new collections.
- **Checks:** lint (0 errors), typecheck, 110 unit tests (no network), build green; Playwright e2e `tests/e2e/inbox.spec.ts` green (plain HTML form, cross-origin fetch, honeypot, inbox, search, snippet picker). Screenshots: `docs/qa/m2/inbox-{375,1440}-{light,dark}.png`.
- **NOT deployed** (per task). Env to set on deploy: `MAIL_WEBHOOK_SECRET` (and the provider webhook pointing at `/api/hooks/mail`), then `npm run db:indexes`; add `deliver-pending` to the Cloudflare cron worker JOBS (already in wrangler.toml).
- **Next: M3** templates (compact, plain, preview parity), outbound webhooks for submissions, onboarding (field linter, "Send test submission", troubleshooting email), owner alert emails, soft-cap notices at 80/100%, retention purge. Search index and 100k benchmark in M4.

## 5 Nov 2026 (M3 code done, not deployed)
- **M3 built on the kit, per ROADMAP M3 and the "Left for M3" list.** Not deployed (per task).
  - **Templates:** default, compact table, plain text, `{{field}}` subjects; one renderer for preview and send (`renderNotification`, parity tested). Page `/app/forms/[id]/templates` with live server preview.
  - **Outbound webhooks per form** via the kit module (HMAC-SHA256, retries, log, replay): `submission.received|delivered|bounced|held`. Gate = `integrations > 0` in `product.ts`, i.e. Starter and above per docs/brief.md (Free sees an upgrade notice, API returns `plan_required`). Page `/app/forms/[id]/webhooks`.
  - **Onboarding:** field linter (12 rules), "Send test submission" ([Test] label, not metered, shows the receipt), troubleshooting email after 3 rejected posts from a blocked origin. Page `/app/forms/[id]/onboarding`.
  - **Owner emails:** spam burst alert (20 in 10 min, 1 an hour) and usage notices at 80% and 100%, once per period each.
  - **Retention:** cron `retention-purge` (plan days in `product.ts`, audit entry per workspace) and per-form "delete all submissions". The submissions TTL index became a plain index (D-M3-2).
  - **Search:** Mongo text index `submissions_search` + matching memory filter (`$text`); `scripts/bench-search.ts`: 100k rows, memory driver, p50 133 ms, p95 164 ms (first query 408 ms builds the token cache). **Mongo benchmark pending** until `MONGODB_URI` is set and `npm run db:indexes` has run; target p95 < 300 ms.
- **Checks:** lint (0 errors), typecheck, 152 unit tests (no network), build green; Playwright: new `tests/e2e/m3.spec.ts` + the two earlier specs pass (memory driver). Screenshots `docs/qa/m3/{templates,onboarding}-{1440-light,375-dark}.png`.
- **On deploy:** run `npm run db:indexes` (new text index; the old `purgeAt` TTL index must be dropped first if it exists: `db.submissions.dropIndex("purgeAt_1")`), add `retention-purge` to the Cloudflare worker JOBS (already in wrangler.toml; not added to `vercel.json` because Hobby caps cron jobs, call it daily from the worker or upgrade).
- **Known gaps:** test submissions are not visibly labelled in the inbox list; word search is whole word (documented in D-M3-1).
- **Next: M4:** own-mail-server path behind the Mailer interface, founder admin (workspace search, abuse flags, suspend form, plan override, suppression list), domain verification pages, `/status` and canary cron; then M5.


## 5 Nov 2026 (M4 code done, not deployed)
- **Admin** `/admin` (search, pipeline status), `/admin/org/[id]` (abuse signals, suspend form/workspace, plan and limit override, audit), `/admin/suppressions` (list, add, remove). Every write audited. See D-M4-1.
- **Own-mail path:** `SmtpMailer` (nodemailer, DKIM options, VERP, daily cap), DSN/ARF parser and `/api/hooks/dsn`, `docs/OWN_MTA.md`, flag `own_mta_live` off; default provider unchanged. D-M4-2.
- **`/app/domains`:** SPF/DKIM/DMARC records and "Check records" (node:dns, stub-tested); `/app/usage` with 12 month SVG chart. Nav items added.
- **Polish:** "Test submission" badge in inbox list and detail, whole-word search hint, cron table (incl. `retention-purge`) in ARCHITECTURE.md.
- **Docs:** 7 new `/docs` pages (13 total), `llms.txt` updated, no own-MTA claim.
- **Checks:** lint 0 errors, typecheck, 194 unit tests (new `tests/unit/m4.test.ts`, no network), build, Playwright 6 pass (new `tests/e2e/m4.spec.ts`; `ADMIN_EMAILS` added to its server env). Screenshots `docs/qa/m4/`.
- **On deploy:** `npm run db:indexes` (unchanged this milestone); optional env in `.env.example` (`SMTP_*`, `DSN_WEBHOOK_SECRET`); MANUAL_STEPS item 4.
- **Next: M5** QA, Lighthouse, Opus review, launch checklist; also `/status` + canary cron and AI builder prompts (D-M4-6).

## 5 Nov 2026 (M5 pre-launch review, not deployed)
- **Review written: `docs/REVIEW.md`** (4 P0, 11 P1, 12 P2, file and line, scenario, fix). Decisions D-M5-1 to D-M5-8.
- **P0 fixed:** lost provider mail events (bounce never suppressed after a failed attempt); ALTCHA challenge had no CORS, so "Require ALTCHA" rejected every submission; pricing sold unbuilt features (sending domain, autoresponder, uploads, white label, integrations, add-ons) and the landing FAQ made four untrue claims.
- **P1 fixed:** held meter grew every cron minute; double count and double send when cron and the Stripe webhook released holds together; holds waiting on a recipient stuck when a confirmed address was re-added; retention purge was never scheduled without the worker (new `maintenance` cron); cron run lock; seats enforced; webhook endpoints capped by plan; webhook SSRF via DNS. P2 fixed: test rows kept past 7 days, privacy settings path.
- **Open (follow-up task):** P1-9 provider event before message id saved, P1-10 deletion leaves audit log/suppressions/global Bayes words, P1-11 deep health check, and the P2 list.
- **Checks:** lint 0 errors, typecheck, 207 unit tests (13 new in `tests/unit/review.test.ts`), build, Playwright 6 pass.
- **Manual:** MANUAL_STEPS items 5 (Cloudflare cron worker) and 6 (human a11y pass, `{{verify}}` cells).
- **Next:** deploy, `npm run db:indexes`, then the open P1s.

## 6 Nov 2026 (M5 follow-up, not deployed)
- **P1-9, P1-10, P1-11 fixed** with tests in `tests/unit/m5b.test.ts` (failed first): mail hook answers 409 for a young unknown message id so the provider retries; account deletion removes audit log, org suppressions, form-scoped spam words; `/api/health` returns 503 when Mongo is unreachable (1 s timeout).
- **`/status`** (static-looking, reads `uptime_checks`, 90 day bar, footer and sitemap link) fed by cron jobs `uptime-probe` (worker, every minute once deployed; add to the worker `JOBS`, done in wrangler.toml) and `canary` (also inside the daily `maintenance` job, so it runs on the Vercel slot).
- **AI builder prompts** (Lovable, Bolt, v0, Claude Code) on `/docs/install`; they tell the builder to leave `<form_key>` and where to paste the key, no pre-filled claim.
- **P2 fixed:** P2-5, P2-6, P2-12, P2-8 (Resend named). Left open: P2-3, 4, 7, 9, 10, 11.
- **On deploy:** `npm run db:indexes` (new `uptime_checks` and `suppressions.scope` indexes).
- 2026-11-10: indexes now auto-created once per instance on first Mongo getDb() (fire and forget, skipped at build and for memory driver, conflicts/errors logged); `npm run db:indexes` still works. Tests: tests/unit/auto-indexes.test.ts. Not deployed.
- 2026-11-10 (launch hardening, not deployed): all P1s were already fixed; re-checked money paths (idempotent, out-of-order safe, unknown events 200 + log) and mail paths. Fixed Resend-rejection 500s in recipient confirmation, magic link and invite mail; tests in tests/unit/launch.test.ts. Open: P2-3, 4, 7, 9, 10, 11 and L-5 (late PI after refund).
- 2026-11-10 (browser-test defects, not deployed): `/favicon.ico` 308s to `/icon`; every page with `openGraph` now also emits `og:image` and `twitter:image` (absolute URL to `/opengraph-image`, helpers in `src/lib/seo.ts`; root layout, home, pricing, compare, `pageMetadata`); `{{verify}}` cells render an "Unverified" badge with a title and the sentence is reworded; docs grid uses `grid-cols-1`, `min-w-0` on aside/sections/code block, `break-words` on paragraphs. Tests: `tests/unit/seo.test.ts`, new e2e in `flow.spec.ts` (og/twitter tags, favicon, docs overflow at 375px). Lint, typecheck, 222 unit tests, build green. Playwright browser binaries are missing in this runner, so only the request-based e2e ran (passed); the docs 375px overflow test is unrun.
- 2026-11-10 (bug fix, not deployed): /app/settings/audit crashed because a server page called `formatDate` from the "use client" module `components/app/api`. Moved it to `src/lib/format.ts` and all importers updated; same pattern found and fixed for `themeInitScript` (now `src/lib/theme-script.ts`, used by the root layout). Guard: `tests/unit/use-client-boundary.test.ts` fails if a server file imports a non-component export of a client module (verified it fails on the old audit import). New e2e `tests/e2e/app-routes.spec.ts` visits every /app route (200, one h1, no error boundary). Lint, typecheck, unit tests, build green; Playwright browsers are missing in this runner so the e2e is unrun.
- 2026-11-10 (ad readiness, not deployed): honest-claims audit. Hobby = daily cron, 60 s, no worker. Mail/webhook retry schedules (1 min..6 h, 30 s..12 h), status page "every few minutes" and the landing FAQ "retried until it finishes" depended on faster cron; now driven by `SCHEDULER_CADENCE` + `cadence` copy in `src/config/product.ts` ("daily"; flip to "frequent" once the Cloudflare worker runs per minute). First delivery attempt already runs in the request (after()). Visible "Sample data" labels reworded to "Illustration"/example. Test: `tests/unit/cadence.test.ts`. Admin-only "not configured" left (not visitor-facing).
