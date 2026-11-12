# Pre-launch review (M5), 5 Nov 2026

Scope: the code on `main` after M4 (not the PROGRESS summaries): ingest `/f/:key`, spam, metering and holds, delivery and receipts, mail events, retention, auth and admin, billing, outbound webhooks, data protection, public claims, ops. Accessibility was checked by reading the key screens' code against DESIGN_PLAYBOOK §9 and the M1 to M4 QA notes, not with a new audit run.

Severity: **P0** must be fixed before launch (all fixed in this task), **P1** fix soon (fixed here when small and safe), **P2** later.
Regression tests for every fix are in `tests/unit/review.test.ts`; each failed before its fix (checked by stashing the `src` changes).

## P0 (all fixed)

| # | Area | Where | Failure scenario | Fix |
|---|---|---|---|---|
| P0-1 | Delivery receipts, bounces | `src/lib/delivery/events.ts:47` (`applyMailEvent`) | The provider event id was saved as "seen" *before* the event was applied. If anything failed afterwards (a Mongo blip during the suppression write), the route answered 500, the provider retried, and the retry was dropped as a `duplicate`. A hard bounce was then never suppressed (we keep mailing a dead address, which hurts the shared sender reputation of every customer) and the receipt stayed at Dispatched for good. The same happened to an event for a message id we did not know yet. | The id is still claimed first (concurrent duplicates are dropped) but is released again when processing throws or the message is unknown, so the retry is applied. |
| P0-2 | Spam layer, lost submissions | `src/app/api/altcha/route.ts:9` | `/api/altcha` had no CORS headers. The ALTCHA widget runs on the customer's site (another origin), so the browser hid the challenge, the widget could never solve, and a form with "Require ALTCHA" on rejected **every** submission with `captcha_failed`. The setting's help text and the docs gave no warning. | CORS `*` on GET and OPTIONS (the challenge is public and cookie-free). The form setting and `/docs/spam` now give the absolute `challengeurl` and say that without the widget every post is rejected. |
| P0-3 | Paid claims | `src/config/product.ts:123-146`, `src/app/(marketing)/pricing/page.tsx` | The pricing cards sold features that do not exist in the code: Pro "Custom sending domain" (nothing sends from it, D-M4-2), "Autoresponder and file uploads" (uploads return `files_not_supported`, no autoresponder), "Webhooks and 5 integrations" (no integrations), Agency "Client workspaces" and "White label emails" (not built; any plan can create workspaces). The add-ons table listed prices for add-ons that have no Stripe price and cannot be bought. | Highlights now list only what works (submissions, recipients, seats, signed webhook endpoints, delivery log, history, support). A "Planned, not in any plan yet" line lists the rest from `product.planned`. The add-ons table caption says "Planned monthly add ons, not on sale yet" (`product.addOnsOnSale = false`). A test fails if a plan highlight names an unbuilt feature. |
| P0-4 | Public claims | `src/app/(marketing)/page.tsx:122-146` | FAQ and bento said: "Ingest is built to keep accepting submissions and replay them" (false: if Mongo is down `/f` answers 503); "copy paste prompts for Lovable, Bolt, v0 and Claude Code with your key filled in" (not built, D-M4-6); "Our proof of work check runs invisibly" (it is optional, off by default); "What counts: delivered legitimate submissions" (they count when admitted, before delivery); "a custom sending domain on Pro". | Copy rewritten to what the code does: saved before success and retried, clear error otherwise; install guide and llms.txt; PoW optional per form; counted once when they pass the spam check, held over-limit rows count when released, Mark spam gives the unit back; signed webhooks from Starter. |

## P1

| # | Area | Where | Failure scenario | Status |
|---|---|---|---|---|
| P1-1 | Metering | `src/lib/delivery/process.ts:39` | Every cron run (every minute) re-tried the oldest over-limit hold and added 1 to the `held` meter again, so `/app/usage` and the billing meter showed hundreds of held submissions for one. | **Fixed:** counted only when a row first becomes held. |
| P1-2 | Metering, duplicates | `src/lib/delivery/process.ts:33` | `releaseHeld` runs from the cron and from the Stripe webhook. Two at once both read `metered: false`, both counted the unit and both sent the notification. | **Fixed:** an atomic claim (`metered: {$ne: true}` update) before `admit`; the loser stops. Same for holds waiting on a recipient (`dispatchHeldUnverified`, `src/lib/delivery/dispatch.ts:103`, used by the verify link and the cron). |
| P1-3 | Lost submissions | `src/lib/delivery/process.ts:157` | A submission held as `recipient_unverified` was only released by a confirmation link click. If the owner instead re-added their own already-confirmed address (no link is sent for it), the held rows stayed held forever. | **Fixed:** `deliver-pending` dispatches those holds once the form has a confirmed recipient. |
| P1-4 | Ops, retention | `vercel.json`, `src/lib/cron/jobs.ts` | `retention-purge` ran only from the Cloudflare worker, which is not deployed, so the privacy policy's "then deleted" never happened. | **Fixed:** new `maintenance` job (webhook retries + retention purge) on the daily Vercel cron slot; the worker still runs each job every minute once deployed (MANUAL_STEPS item 5). |
| P1-5 | Ops, duplicates | `src/app/api/cron/[job]/route.ts:25` | Two triggers of a job in the same minute (Vercel Cron and the worker both at 04:00, or a manual call) ran it twice in parallel: duplicate retries and double sends. | **Fixed:** 50 s run lock per job (`claimCronRun`). |
| P1-6 | Billing leak | `src/lib/auth/index.ts:108` | Seats were never enforced: Free (1 seat) could invite unlimited members, so nobody needed Pro or Agency for a team. | **Fixed:** Better Auth `membershipLimit` reads `seats` from the plan (checked on invite accept and add member); the Members page states the seat count. |
| P1-7 | Billing leak | `src/app/api/webhooks/route.ts:29`, `src/app/api/forms/[id]/webhooks/route.ts:36` | The `integrations` limit only gated "any webhooks"; Starter (1) could create 5 per form and 20 per workspace. | **Fixed:** endpoint count across the workspace is capped at the plan's `integrations` (1, 5, 10); pricing and `/docs/limits` say "webhook endpoints". |
| P1-8 | SSRF | `src/lib/webhooks/outbound.ts:65` | `isSafeWebhookUrl` checked the host string only. A DNS name pointing at 127.0.0.1, 10/8, 169.254.169.254 or CGNAT passed, and the server POSTed to it (blind SSRF; only the status code is shown back). | **Fixed:** in production every resolved address must be public (`resolvesPublic`, IPv4 and IPv6 private ranges); otherwise the delivery fails with `unsafe_target`. DNS rebinding between lookup and connect is still possible (P2-10). |
| P1-9 | Delivery race | `src/lib/delivery/dispatch.ts` (`sendDelivery`) | A provider event that arrives before we save `mailerMessageId` is answered `unknown` with 200 and not retried by the provider, so that receipt stamp is lost. Rare (the save follows the send call within milliseconds). | **Fixed:** the mail hook answers 409 for an `unknown` event younger than 10 minutes (the claim is already released), so the provider retries it (`retryableUnknown`). |
| P1-10 | Data protection | `src/lib/db/mongo.ts:266` (`deleteOrgData`) | Account deletion leaves the workspace's `audit_log` (with IPs), its suppression list entries and the words it contributed to the global Bayes tokens. The privacy policy promises removal within 30 days. | **Fixed:** `deleteOrgData` also deletes the workspace `audit_log`, its `org:<id>` suppressions and its form-scoped spam words; the `org.deleted` audit record carries no IP and no org link. Global Bayes counts are anonymous word counts and stay. |
| P1-11 | Ops | `src/app/api/health/route.ts` | `/api/health` always says ok, even with Mongo down, so an uptime monitor never alerts. | **Fixed:** `/api/health` pings the database (1 s timeout) and returns 503 with `ok: false` on failure (`src/lib/health.ts`). |

## Launch hardening (10 Nov 2026)

All P1-1 to P1-11 above are fixed; none is open. Money and mail paths re-checked:

| # | Where | Finding | Status |
|---|---|---|---|
| L-1 | `src/lib/forms/recipients.ts` (`sendVerification`), used by add recipient and resend | When Resend rejected the confirmation mail (bad address, rate limit) the route answered 500 after the recipient was already saved. | **Fixed:** error caught and logged (status code only), throttle freed, `sent: false`. Test `tests/unit/launch.test.ts` (failed before). |
| L-2 | `src/lib/auth/index.ts` magic link and invitation mail | A provider rejection surfaced as a 500 from the auth handler. | **Fixed:** caught and logged; no provider text reaches the client. |
| L-3 | `src/lib/billing/webhook.ts` | Unknown event types were acknowledged but not logged. | **Fixed:** 200 plus an info log; test added. |
| L-4 | Stripe webhook idempotency | Entitlement is recomputed from Stripe subscriptions on every relevant event (subscription.*, invoice.*, checkout.session.completed, charge.refunded), the event id is recorded only after success, duplicates answer 200. Out-of-order and duplicate events converge; checkout success does not rely on the redirect (webhook plus `?refresh=1`). | **Checked, fine** (existing tests C-25, C-26). |
| L-5 | `payment_intent.succeeded` (lifetime) | A `charge.refunded` processed *before* a late `payment_intent.succeeded` of the same lifetime payment would leave the plan granted. Needs the Stripe API to look up the charge; extremely rare. | **Open (P2), reason:** needs live Stripe API (no key here), extremely rare. Check the PI's charge `refunded` flag before granting. |
| L-6 | Delivery mail, owner notices | Already catch provider errors (retry with backoff, `owner_mail_failed` warning). | **Checked, fine.** |

## P2

| # | Where | Finding | Fix |
|---|---|---|---|
| P2-1 | `src/lib/inbox/purge.ts:37` | Test submissions (stamped 7 days) were re-stamped to the plan's history by the purge and kept for months. | **Fixed** (test rows keep their 7 days). |
| P2-2 | `src/content/legal/privacy.ts` | Said export and delete live under "Settings, then Account"; the page is Settings, Profile. | **Fixed.** |
| P2-3 | `src/lib/delivery/process.ts:95` | Mark spam gives the unit back to the month the submission was *received*, but a held row released next month was counted in the month it was *admitted*. | **Fixed** (`hardening: mark spam refunds meteredPeriod`): `meteredPeriod` stored when counted, refunded to that month. Test `tests/unit/hardening.test.ts`. |
| P2-4 | `src/lib/delivery/process.ts:57`, `src/app/api/forms/[id]/route.ts:21` | Deleting a form keeps its submissions; a row still `received` when its form is deleted (or one that always throws) stays `received`, and `deliver-pending` takes the 100 oldest stuck rows, so 100 such rows would starve the re-drive for everyone. | **Fixed** (`hardening: stuck rows`): rows of a deleted form, or past 20 re-drives, are marked `failed` with a receipt event; one failing row no longer aborts the batch. |
| P2-5 | `src/lib/security/ratelimit.ts:15` | 5 posts a minute per IP across all forms: an office or school behind one NAT can get 429 (rejected, not held). | **Fixed** (IP limit is per form and IP). |
| P2-6 | `src/lib/security/disposable.ts:23` | `normEmail` lets `<`, `>`, `"` and `,` through, so Reply-To can carry a display-name form. No header injection (no CR/LF, JSON API). | **Fixed** (`< > " , ; : ( ) [ ] \` rejected). |
| P2-7 | `src/content/compare.ts`, landing compare table | `{{verify}}` cells render publicly. Honest, but unpolished. | **Open, business/research:** needs real competitor facts from the owner. |
| P2-8 | `src/config/product.ts` `subProcessors` | Google (sign-in, when `GOOGLE_CLIENT_ID` is set) is not listed; the email provider is unnamed. Cloudflare (cron worker) carries no personal data. | **Partly fixed:** Resend is named. **Open, reason:** Google sign-in is off in production; add the sub-processor the day `GOOGLE_CLIENT_ID` is set. |
| P2-9 | `src/lib/billing/webhook.ts` | Upgrade via `/api/billing/entitlement?refresh=1` does not release held submissions; the Stripe webhook does it seconds later. | **Fixed** (`hardening: release held on refresh`): `?refresh=1` calls `releaseHeld` (atomic claim, safe next to the webhook). |
| P2-10 | `src/lib/webhooks/outbound.ts` | DNS rebinding between our lookup and `fetch`'s own lookup. | **Open, reason:** needs a custom agent/undici dispatcher and no new library is allowed here; planned for the VPS move. |
| P2-11 | `src/lib/db/mongo.ts:254` (`exportOrgData`) | Export caps submissions at 5,000 and leaves out deliveries and receipt events. | **Fixed** (`hardening: export`): deliveries and receipt events included; caps raised to 50,000 submissions (CSV too). True streaming left for the VPS. |
| P2-12 | Free plan "7 day delivery log" | Receipts are actually kept 90 days on every plan (D-M4-4). True as a minimum, but it hides a difference we do not enforce. | **Fixed** (copy now says "Delivery receipts for every email"). |

## Checked and fine

- `/f/:key`: body size and field limits, prototype keys dropped, CR/LF stripped from subject, redirect only to the posting origin, our origin or allowed origins (no open redirect), stored before success, 503 with Retry-After when Mongo is down, honeypot spam counted on `spam` only.
- Spam never counts on the `submissions` meter; over the limit rows are held, never rejected; tests and holds are not metered.
- Unverified recipients get only the confirmation email; confirmation is a POST button (link scanners cannot confirm).
- IDOR: every form, recipient, submission, webhook, delivery and domain route checks `orgId` (`getOwnedForm`, `r.orgId`, org-scoped Db calls). Roles checked with `requirePermission`.
- CSRF: `withApi` checks Origin/Referer on non-GET; Stripe, mail, DSN and cron hooks are signed or secret-checked with constant-time compare. Cookies `__Host-`, `SameSite=Lax`.
- Admin: `/admin` layout and every admin API check `ADMIN_EMAILS` (404 otherwise); sign-in is magic link or Google only, so the email is proven.
- Billing: signature on the raw body, event id recorded only after success, entitlement recomputed from Stripe subscriptions filtered by `metadata.app` and `postslot_` lookup keys, read-time expiry, full refunds end the plan, no client input can set a plan (checkout takes only plan and interval; the entitlement comes from Stripe).
- XSS: React escapes inbox values; notification HTML escapes every value; CSV cells guard formula injection.
- Secrets: logs carry codes and messages, not bodies or keys; webhook secrets are returned once and stripped from lists and exports.
- Env: every key in `src/lib/env.ts` is in `.env.example`.
- Accessibility (code read): labelled inputs (`Field`), 44 px targets (`min-h-11`) on nav, buttons and toggles, `focus-visible:focus-ring` everywhere, `role="status"` for async results, reduced motion handled in `globals.css`. M1 to M4 screenshots at 375/1440 light/dark show no overflow. A full keyboard and screen reader pass with a person is still worth doing before paid launch.

## Hardening and usefulness round (12 Nov 2026)

| # | Area | Change |
|---|---|---|
| H-1 | CSP | Audited against every origin in `src` (client `fetch`, `<form action>`, Stripe redirects, scripts). Unit test fails if client code fetches an origin `connect-src` lacks; Playwright `tests/e2e/hardening.spec.ts` walks the pages in a real browser and fails on any CSP violation console message. |
| H-2 | Rate limits | Magic link: 30 per IP per 10 min plus 5 per address per 10 min (over it: no mail, identical answer). Invites: 60 per IP per hour, 30 per workspace per hour. Unknown form keys: 30 misses a minute per client then 429. Bulk actions 20 a minute per workspace. Delete-user 10 an hour. |
| H-3 | Resilience | Mongo connection errors answer 503 `service_unavailable` + Retry-After (sentence in the UI); 30 s client timeout; Resend call 10 s timeout; Stripe client 15 s timeout. |
| H-4 | Operations | `/api/health` adds `deps` (mail provider word, billing configured/stub, booleans) and `degraded` list; still 503 only for the database. Indexes added for `deliveries` and `delivery_events` by `orgId` (export, delete). Logs mask emails, connection strings, bearer tokens and ip/to/body keys. |
| H-5 | Secrets | `tests/unit/bundle-secrets.test.ts` greps `.next/static` for secret names, shapes and live values (clean; better-auth's empty env accessor is allow-listed). |
| H-6 | Usefulness | First-run checklist on the inbox, inbox pagination ("Older submissions"), keyboard shortcuts (j/k, /, Esc), bulk "Not spam" for a page of spam, migration doc (Formspree, Web3Forms), export includes receipts. |
| H-7 | Stripe | Real-signature tests: bad, missing, tampered and replayed (old timestamp) signatures rejected, duplicates 200. |
