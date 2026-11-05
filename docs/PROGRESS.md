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
