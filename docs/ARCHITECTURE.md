# ARCHITECTURE: Postslot by BufferSol

Phase 0, 5 Nov 2026. Source of scope: `docs/brief.md` (every P0, numbered 1 to 12 below as in the brief). Foundation: the universal kit already in this repo (`kit-v1`): Next.js 16 App Router on Vercel, MongoDB behind the `Db` interface (`src/lib/db`), Better Auth (`src/lib/auth`), Stripe billing + entitlements (`src/lib/billing`), `Mailer` (`src/lib/mail`), Mongo rate limiter and ALTCHA (`src/lib/security`), outbound webhooks (`src/lib/webhooks`), cron (`src/lib/cron`), audit log, admin shell. Product constants live only in `src/config/product.ts`.

## 0. Deliberate deviations from the brief (logged in DECISIONS.md)

| Brief says | We build | Why / how it moves later |
|---|---|---|
| Cloudflare Worker + Hono ingest | Next.js route handler `src/app/f/[key]/route.ts` (Node runtime) | Owner rule: Vercel first. Handler is a thin adapter over `src/lib/forms/ingest.ts` (pure functions), so it can run in a Worker or on the VPS. |
| Postgres 17, UUIDv7, Hyperdrive | MongoDB via the kit `Db` interface; ids from `src/lib/ids.ts`; TTL fields are `Date` | BATCH1_PLAN standing decision. |
| Own KumoMTA, Haraka, FBL, warm-up, IP pools | `Mailer` provider adapter now; same interface + a normalised `MailEvent` stream later from KumoMTA and Haraka | Section 4. Nothing in the dashboard or data model changes at the switch. |
| Rspamd Bayes (brief is inconsistent: P1 in FR-13, launch in sheet 28) | In-house token Bayes in Mongo, per form + global, plus the rules engine | Rspamd is P1 per FR-13; ours is a smaller deterministic classifier with the same `spam_signals` output. Rspamd can be added as one more scorer. |
| Valkey, Durable Objects counters | Mongo atomic counters and the kit sliding window | D-K8. |
| Prometheus/Grafana/Loki/GlitchTip/Uptime Kuma | Structured logger (Vercel logs), `/api/health`, a synthetic canary cron, admin Ops page, public `/status` | VPS later. No third party analytics or error SaaS. |
| Search: Postgres FTS + trigram | Mongo compound text index plus prefix fields (section 6) | Same UX and the p95 target. |

Never used: any LLM or paid AI API, any ad. Stripe and the mail provider adapter are the only external parties in the request path; the provider adapter is replaced by own MTA on the VPS. Sub-processor copy stays in `product.ts`.

## 1. System shape

```
Visitor browser / server ──POST──> /f/:form_key ──> ingest pipeline ──> submissions (Mongo)
                                         │               │
                                         │               ├─ edge checks (sync, <150 ms p95)
                                         │               └─ after(): score → sort → dispatch → Mailer
                                         ▼
                              Owner inbox UI (/app/…) <── delivery events <── provider webhook /api/hooks/mail
                                                                          <── (later) KumoMTA/Haraka /api/hooks/mta
Vercel Cron / Cloudflare cron worker ──> /api/cron/{sweep,retry,usage,retention,warmup(later),canary}
```

Durability rule: the submission document is written **before** anything else happens (`status: "received"`), and the visitor gets success only after that write. Scoring and mail run in `after()`; a `sweep` cron (every minute via the Cloudflare cron worker template, daily on Vercel Hobby) re-drives any submission stuck in `received` or any delivery in `queued` older than 2 minutes. If Mongo is down the handler returns 503 with `Retry-After` and a JSON `{success:false,message}`; the raw payload is never silently dropped (the brief's R2 replay path is a VPS/R2 item, section 13).

Module layout to add (all new code under `src/lib/forms`, `src/lib/spam`, `src/lib/delivery`, `src/lib/inbox`; routes thin):
`forms/ingest.ts` (parse, validate, special fields), `forms/keys.ts` (22 char base62 key), `spam/{honeypot,timetoken,altcha,domainlock,rules,bayes,score}.ts`, `delivery/{dispatch,events,bounce,suppress,templates,timeline}.ts`, `inbox/{query,export,retention}.ts`, `billing/softcap.ts`, `onboarding/{snippets,linter}.ts`.

## 2. Data model (MongoDB, database `postslot`)

All documents carry `app:"postslot"` and `orgId` (the kit's org = workspace). Dates are `Date`. Ids are strings from `ids.ts`. Indexes are created by `scripts/ensure-indexes.ts` (`npm run db:indexes`).

| Collection | Key fields | Indexes / TTL |
|---|---|---|
| `forms` | `_id`, `orgId`, `name`, `key` (public, 22 chars), `status` active/paused/suspended, `redirectUrl?`, `allowedOrigins[]`, `spamMode` standard/strict/off, `spamThreshold` (default 0.7), `rules{maxLinks,blockedPhrases[],blockScripts,blockCharsets[],blockCountries[],blockDisposable}`, `templateId`, `subjectTemplate`, `recipientIds[]`, `retentionDays` (7 to 1095 or null = unlimited on paid), `autoreplyEnabled`, `createdAt` | unique `{key}`, `{orgId,createdAt}` |
| `recipients` | `orgId`, `email` (lowercase), `verifiedAt?`, `verifyTokenHash`, `verifySentAt`, `source` login/manual | unique `{orgId,email}` |
| `submissions` | `_id`, `orgId`, `formId`, `receivedAt`, `status` received/delivered/quarantined/held/failed, `fields{}` (strings, bounded), `replyTo?`, `fromName?`, `subject?`, `searchText`, `emailLower?`, `spamScore`, `signals[{name,weight,detail}]`, `scored` (false = "unscored"), `heldOverQuota`, `isTest`, `origin?`, `ipHash` (HMAC with rotating pepper), `ua?`, `released{at,by}?`, `purgeAt` (Date) | `{formId,receivedAt:-1}`, `{orgId,status,receivedAt:-1}`, `{orgId,searchText:"text"}`, `{orgId,emailLower:1}`, TTL on `purgeAt` (set from retention; unlimited = absent) |
| `deliveries` | `_id`, `orgId`, `submissionId`, `recipientId`, `channel` email, `mailerMessageId` (provider id now, MTA id later), `pool` notify, `status` queued/dispatched/accepted/deferred/returned/complaint/blocked, `attempts`, `lastEventAt`, `template`, `createdAt` | unique sparse `{mailerMessageId}`, `{submissionId}`, `{status,lastEventAt}` |
| `delivery_events` | `deliveryId`, `orgId`, `type` received/sorted/dispatched/accepted/deferred/returned/complaint/expired, `at`, `detail` (SMTP reply text, classification), `raw` (provider payload, no submission content), `expireAt` | `{deliveryId,at}`, TTL `expireAt` (90 days, `DELIVERY_TTL_DAYS`) |
| `suppressions` | kit `Suppression` extended with `orgId`, `source` provider/mta/haraka/fbl/owner, `releasedAt?`; scope = org | unique `{orgId,email}` active |
| `usage` (kit `incUsage`) | meters `submissions` (legit), `spam`, `held` per `period` `YYYY-MM` | kit |
| `usage_notices` | `orgId`, `period`, `threshold` 80/100, `sentAt` | unique `{orgId,period,threshold}` |
| `sender_allow` | `formId`, `email`, `at` (from "Not spam") | unique `{formId,email}` |
| `bayes_tokens` | `scope` (`form:<id>` or `global`), `token`, `spam`, `ham` | unique `{scope,token}` |
| `form_rate` / `rate_limits` | kit sliding window, keys `ip:<hash>` and `form:<id>` | TTL `expireAt` |
| `altcha_used` | `challengeHash`, `expireAt` (replay guard) | TTL |
| `mail_inbound_events` | idempotency by provider event id | TTL 7 days |
| `templates` | system templates in code (default, compact, plain); per form choice only (P0) | n/a |
| `abuse_flags` | `orgId`, `formId?`, `kind`, `score`, `at`, `resolvedAt?` | `{resolvedAt,at}` |
| `status_checks` | canary runs for `/status` | TTL 30 days |
| kit collections | `billing_accounts`, `entitlements`, `stripe_events`, `audit`, `webhook_*`, Better Auth tables | kit |

Entitlement limits (`product.ts`): `submissions`, `recipients`, `integrations`, `seats`, `storage_mb` per plan. History/retention caps per plan are derived in `inbox/retention.ts` from plan id (Free 90 days, Starter 180, Pro 365 or unlimited, Agency 365 or unlimited).

## 3. The `/f/:form_key` endpoint (P0 1)

`POST /f/:key` and `OPTIONS` (CORS). Accepts `application/x-www-form-urlencoded`, `multipart/form-data` (file parts rejected with a clear 422 until P1 uploads), `application/json`.

Pipeline (each step returns early with a typed error; every error is JSON when `Accept: application/json`, otherwise a 303 redirect back with `?error=<code>` or a small hosted error page; never a silent drop):

1. Size and shape: body over 100 KB or over 25 fields → 413 / 422 (`payload_too_large`, `too_many_fields`).
2. Key lookup (`forms.key`) → 404 `unknown_form` with the copy from the brief; paused/suspended → 403.
3. Edge spam layers (section 5), in cost order.
4. Normalise fields: `email`/`replyto` → `replyTo`, `subject`, `from_name`, `redirect`, `_gotcha`/`botcheck` honeypot, `ps_token`, `altcha`. Special fields are stripped from `fields`.
5. Persist `submissions` (`received`), bump meters later in scoring.
6. Respond: JSON `{success:true,id,message}` (200) when `Accept: application/json` or `Content-Type: application/json`; else 303 to the form's `redirectUrl` or the posted `redirect` (validated against allowed origins/own host to avoid open redirect) or the hosted thank-you page `/thanks`.
7. `after()`: score, sort, dispatch (sections 5 and 6).

CORS: `Access-Control-Allow-Origin: *` on `/f/*` (the form key is public by design; the origin check is the domain lock, section 5). `src/proxy.ts` and the kit CSRF/origin check must exempt `/f/*` and `/api/hooks/*` and keep them on every other mutating route. The route is `noindex`, excluded from the sitemap, and `Cache-Control: no-store`.

Acceptance (P0 1): a plain HTML form with no JS delivers an email and lands on the redirect (e2e with Playwright against the memory driver and console mailer); a cross-origin `fetch` with `Accept: application/json` receives `{success,id,message}` and CORS headers; 101 KB body → 413; 26 fields → 422; each special field has a unit test and a row in the docs table (`src/content/docs`).

## 4. Delivery through the `Mailer` interface (P0 4)

Today `src/lib/mail/types.ts` has `MailTransport.send()` returning `{id,provider,accepted}`. We keep that and add one more interface next to it:

```ts
// src/lib/mail/events.ts
export type MailEventType = "dispatched" | "accepted" | "deferred" | "returned" | "complaint";
export interface MailEvent { messageId: string; type: MailEventType; at: Date; detail?: string; recipient?: string; classification?: "hard" | "soft" | "block"; }
export interface MailEventSource { name: string; verifyAndParse(req: Request): Promise<MailEvent[]>; }
```

- **Now (Vercel):** transport = provider adapter selected by `MAIL_PROVIDER` (Resend key arrives as `RESEND_API_KEY`; `console` in dev). Event source = the provider's webhook at `POST /api/hooks/mail`, HMAC verified (`MAIL_WEBHOOK_SECRET`), idempotent via `mail_inbound_events`. Provider "delivered" maps to `accepted` (accepted by the recipient's mail server), "delivery_delayed" to `deferred`, "bounced" to `returned`, "complained" to `complaint`.
- **Later (VPS):** transport `smtp-mta` (the kit's SMTP stub) injects into KumoMTA from `notify@mail.postslot.buffersoltech.com` with Reply-To = submitter, per class pool and DKIM selector; event source `mta` = KumoMTA's HMAC signed log hook at `POST /api/hooks/mta`, plus Haraka for VERP DSNs and FBL. Both emit the same `MailEvent`. The dashboard, timeline, suppression and bounce logic only know `MailEvent`. Warm-up scheduler, per provider shaping, IP pools and DKIM rotation are MTA side config, with a read-only admin view fed by `sending_ips` (added at that time).

Dispatch (`delivery/dispatch.ts`): for each verified, non-suppressed recipient of the form, render the template, send with `Reply-To` = submitter, `Feedback-ID`, `tags {form, submission}`; write `deliveries` + `delivery_events` `dispatched`. Unverified recipient: no content is sent, only the verification email (P0 4 rule); submission stays `held` with reason `recipient_unverified` and is dispatched on verification. Suppressed recipient: delivery `blocked`, event "blocked by suppression", owner alert email (once per recipient per day).

Timeline (`delivery/timeline.ts`): composes `received` and `sorted` (ours, with timestamps) with delivery events into the five stamps the UI shows: Received, Sorted, Dispatched, Accepted (or Deferred, Returned, Complaint). Updates within 60 s of the provider event because the webhook writes directly; the inbox polls the submission every 5 s while a delivery is open.

Honesty gate (matches SECTION_PLAN truth gate): copy says "accepted by the recipient's mail server" only. SPF/DKIM/DMARC pass badges and "own mail servers" copy are behind the flag `own_mta_live` (remote flag via kit `/api/config`).

Acceptance (P0 4): unit tests for event mapping and idempotency; dispatch to an unverified recipient sends only the verification mail; Reply-To equals submitter; deferred then accepted produces both timeline entries in order; the e2e with the console mailer shows the five stamps. Deliverability ACs from the brief (dmarc/dkim pass in Gmail headers, PTR, per provider caps) are verified at the VPS milestone and listed in `MANUAL_STEPS.md` when it exists.

## 5. Spam layers (P0 2 and 3)

Edge layers (synchronous, in `src/lib/spam`), each a named signal written to `signals[]` with weight and detail:

| Layer | Behaviour |
|---|---|
| Honeypot `_gotcha`/`botcheck` | Filled → respond success (or redirect) exactly like a real submission, store as `quarantined` with signal `honeypot`, never email, never count toward quota. |
| Signed time token | Optional `ps.js` (served from our host, no dependencies) writes `ps_token` = HMAC(formKey, issuedAt) on load. Under 2 s or over 24 h since issue adds weight 0.6 (`too_fast`, `stale_token`); missing token adds nothing (no JS forms stay valid). |
| ALTCHA proof of work | Self-hosted with the kit `src/lib/security/altcha.ts` (HMAC key `ALTCHA_HMAC_KEY`), challenge at `/api/altcha`, widget script from our domain, invisible. Replay guard via `altcha_used`. Enabled per form on every plan. Invalid → 422 `captcha_failed` JSON or redirect `?error=`; never silent. |
| Domain lock | If `allowedOrigins` is set, `Origin` (else `Referer`) must match → otherwise 403 with the brief's copy and a `domain_mismatch` row in the form's spam log (separate small capped collection field `forms.blockedLog`, last 50). Server-to-server posts without Origin are allowed when no lock is set. |
| Rate limit | Kit sliding window in Mongo: 5 per minute per IP hash and 120 per minute per form → 429 + `Retry-After`. |

Content layers (async, `spam/score.ts`): rules engine (link count, blocked phrases, script tags, charset toggles, country block from `x-vercel-ip-country`, disposable-email domains via `src/lib/security/disposable.ts`) plus the token Bayes classifier trained by the "Not spam" and "Mark spam" buttons (per form, falling back to global). Score = 1 − Π(1 − weight) clamped; at or above the form threshold (default 0.7) → `quarantined`, else proceed. Scoring failure or more than 800 ms → decide on edge signals, set `scored:false` ("unscored" chip).

Quarantine UI: "Not spam" releases (dispatch within 30 s by `after()` plus cron), adds `sender_allow`, trains Bayes. Allowed senders skip content scoring (not edge layers). Spam, test submissions and honeypot hits never increment the `submissions` meter; they increment `spam`.

Acceptance (P0 2 and 3): one unit test per signal; honeypot filled returns the same body shape as a valid post and sends no email; domain mismatch → 403; 6th post in a minute from one IP → 429 with `Retry-After`; "Not spam" delivers within 30 s and a second post from that sender skips scoring; spam does not move the quota meter; the quarantine view shows the signal names.

## 6. Bounces, complaints, suppression (P0 5)

`delivery/bounce.ts` consumes `MailEvent`s: `returned` + `hard` → insert suppression (`source:"provider"`, later `mta`/`haraka`), delivery `returned`, form banner "We couldn't deliver to … Fix the address or confirm it exists, then press Redeliver." and an owner email, all within 60 s of the event. `soft` stays `deferred`; the provider or MTA retries; after 3 days with no accept the cron writes `expired` and returns it. `complaint` → suppression `complaint`, pauses the form's autoresponder (P1 flag, stored now), owner alert. Unsuppress and redeliver is self-serve: `POST /api/forms/:id/recipients/:rid/unsuppress`, capped at 3 per day per form (Mongo counter), writes an audit entry, then re-dispatches the held and returned submissions. Kit `Db.addSuppression/isSuppressed/removeSuppression` is extended with `orgId` scoping (contract test updated for both drivers).

Acceptance (P0 5): hard bounce event suppresses and shows the banner; soft bounce does not; complaint suppresses; fourth unsuppress in a day is refused with 429; redeliver creates a new delivery with a timeline of its own.

## 7. Templates (P0 6)

Three code-defined templates (default, compact table, plain text) in `delivery/templates.ts`, rendered as plain HTML strings to the kit `{subject,text,html}` shape (D-K7). Subject variables `{{field}}` with a whitelist and HTML escaping; missing fields render empty. Every field value is escaped; no remote images; footer carries the static postmark image on Free ("Sent with Postslot by BufferSol"). The dashboard preview calls the same `render()` function with a sample or real submission, so preview equals sent output (golden test).

## 8. Inbox with search (P0 7)

- Pages: `/app/inbox` (list, filters form/status/date, search), `/app/inbox/[id]` (fields, timeline, signals, Redeliver, Release, Delete). Ledger rows, 40 px, detail pane on desktop, stacked on mobile.
- Search: `$text` over `searchText` (all field values, lowercased, bounded to 8 KB) with equality prefix `orgId` (compound text index), plus exact/prefix match on `emailLower`. Cursor pagination by `(receivedAt,_id)`. Target p95 under 300 ms over 100k rows measured by a seeded benchmark script (`scripts/bench-search.ts`) against Atlas; if the M0 tier misses it, Atlas Search (available on M0) is the swap behind `inbox/query.ts`.
- Export: `GET /api/forms/:id/export?format=csv|json&…filters` streams with a Mongo cursor, no buffering, available on every plan (50k rows within the function limit: 60 s on Pro; chunked by date range with a "next" link if over).
- Retention: per form `retentionDays` 7 to 1095, unlimited on paid; `purgeAt` TTL index does the deletion, and a daily `retention` cron purges deliveries and orphans and applies plan-downgrade history caps. Held submissions are purged like any other row once their plan's history period ends (matches the privacy policy, D-M5-1).

Acceptance (P0 7): seed 100k submissions, search p95 under 300 ms; filters combine; CSV of 50k rows streams without timeout; changing retention updates `purgeAt` on existing rows; purge removes expired rows and their events.

## 9. Onboarding snippets (P0 8)

Static MDX/TS content in `src/content/docs/snippets.ts` for HTML, React, Next.js, Astro, Vue, Svelte, Webflow, Framer, WordPress, and paste-in prompts for Lovable, Bolt, v0 and Claude Code (plain text, no AI API); the dashboard fills the form key. `/llms.txt` and `/llms-full.txt` are generated from the same content. "Send test submission" posts to our own endpoint as `isTest:true` (does not count toward quota) and the UI animates the timeline and the postmark. The field name linter is a small client function (`onboarding/linter.ts`) that parses a pasted HTML snippet or the live page HTML a user pastes (no crawling) and warns on inputs without `name`. If no submission in 10 minutes, a troubleshooting email (cron `onboarding`).

Acceptance (P0 8): every snippet is rendered and POSTed in an e2e test (HTML, React and Next snippets run for real; the rest are compiled string checks of the action URL and method); linter flags a missing `name`; test submission reaches Delivered with the console mailer.

## 10. Billing, plans, soft cap (P0 9)

Reuses the kit Stripe Checkout, Portal, webhook, `recomputeEntitlement` and lookup keys `postslot_<plan>_<monthly|annual>` (see `docs/STRIPE.md`). Annual is default in the toggle. Entitlement change within 60 s of the webhook (kit contract).

Soft cap (`billing/softcap.ts`): after a submission passes spam scoring, `incUsage(org,"submissions",period)`; above the plan limit the submission becomes `held` (`heldOverQuota:true`), counts `held`, is shown in the inbox with a "Held over limit" postmark, and is **not** emailed. Release: on entitlement increase (hook in the webhook handler) and at period start (`usage` cron) the oldest held rows are released up to the new limit and delivered, with one "released" digest email. Notices: at 80% and 100% one email per threshold per period using `usage_notices` unique index. Optional overage on Pro/Agency is a post-M3 decision (`{{overage_price}}` unconfirmed in the brief).

Acceptance (P0 9): an org at limit holds a legit post (stored, visible, not sent); upgrade releases it within 60 s; spam never moves the meter; exactly one 80% and one 100% email per period even under concurrent posts (unique index test); portal plan change flips limits in under 60 s.

## 11. Account (P0 10)

Entirely the kit: Better Auth magic link (sent by the `Mailer`, `transactional` category so suppression does not block it), passkeys, TOTP, org roles, API keys, `__Host-` cookies, account deletion (type workspace name, data removed via `deleteOrgData` extended to every collection above, Stripe subscription cancelled) and data export. DPA download links to the existing `src/content/legal/dpa.ts` page as a PDF-print route. Postslot adds the new collections to `exportOrgData` and `deleteOrgData`.

Acceptance (P0 10): contract test proves delete and export cover forms, recipients, submissions, deliveries, events, suppressions, usage; magic link arrives under 30 s on the real provider (manual check once `RESEND_API_KEY` exists).

## 12. Admin and Ops (P0 11)

Founder admin under `/admin` (kit `ADMIN_EMAILS` guard): search workspaces/forms/submissions metadata (never field content without a logged "reveal" action), abuse flags (`abuse_flags`: spam ratio over 90% with volume, credential/card field names, bounce rate over 4%, complaint rate over 0.08%), suspend/unsuspend form, adjust plan override, suppression list viewer, mail event log, support inbox (inbound `support@` via provider webhook is P1; at MVP it lists mailto links), every action appended to the kit audit log. Ops: `/api/health`, `canary` cron every 5 minutes posts a synthetic submission to a canary form and checks Delivered within 5 minutes, writes `status_checks`, emails the founder through the `Mailer` and sends a push if `NTFY_URL` is set (self-hostable, optional). Public `/status` reads `status_checks`. IP pool, warm-up and blocklist views are placeholders reading `sending_ips` once the MTA exists.

Acceptance (P0 11): a forced canary failure raises an alert email in under 5 minutes; suspending a form makes `/f/:key` return 403 immediately; every admin mutation has an audit row; `/status` renders without auth.

## 13. API surface

| Route | Auth | Purpose |
|---|---|---|
| `POST,OPTIONS /f/:key` | public | Ingest |
| `GET /thanks`, `/ps.js`, `GET /api/altcha` | public | Thank-you page, time token script, PoW challenge |
| `/api/forms` (list/create), `/api/forms/:id` (get/patch/delete), `/api/forms/:id/test`, `/export`, `/recipients`, `/recipients/:rid/{verify,unsuppress}` | session | Form management |
| `/api/submissions`, `/api/submissions/:id`, `…/release`, `…/spam`, `…/redeliver`, `DELETE` | session | Inbox actions |
| `/api/hooks/mail` | Svix HMAC (`MAIL_WEBHOOK_SECRET`) | Provider delivery events |
| `/api/hooks/dsn` | Bearer or `x-webhook-secret` (`DSN_WEBHOOK_SECRET`) | Raw bounce messages (DSN) and abuse reports (ARF) from our own mail server, parsed into MailEvents (M4) |
| `/api/cron/<job>` | `CRON_SECRET` | Schedulers, see "Cron jobs" below |
| `/api/domains`, `/api/domains/:domain`, `/api/domains/:domain/check` | session | Custom sending domain records and DNS check (M4, Pro and above, depends on the SMTP path) |
| `/api/admin/action`, `/api/admin/overview` | session + `ADMIN_EMAILS` | Founder admin writes (suspend, plan, limit, suppression) with audit |
| `/api/billing/*`, `/api/stripe/webhook`, `/api/auth/*`, `/api/admin/*` | kit | Existing |
| `/api/v1/*` (scoped API tokens, OpenAPI) | API key | P1 |

### Cron jobs
Registered in `src/lib/cron/jobs.ts`, called at `/api/cron/<job>` with `Authorization: Bearer $CRON_SECRET`. All are idempotent.

| Job | What it does | Schedule |
|---|---|---|
| `deliver-pending` | Re-drives submissions stuck in `received`, retries queued deliveries with backoff, expires deferrals after 3 days, releases over-limit holds, dispatches holds whose form now has a confirmed recipient | Every minute on the Cloudflare cron worker; daily in `vercel.json` (Hobby) |
| `webhook-retries` | Retries due outbound webhook deliveries | Worker every minute |
| `retention-purge` | Deletes submissions (held ones included) older than the plan's `retentionDays` and writes an audit entry per workspace. Per form "delete all submissions" is separate | Worker every minute (`JOBS` in `infra/cron-worker/wrangler.toml`) |
| `maintenance` | `webhook-retries` + `retention-purge` in one call, so both run daily on Vercel Hobby (two cron slots) even without the worker | Daily in `vercel.json` |

Every job takes a 50 s run lock (`claimCronRun`), so two triggers of the same job within 50 s (the worker and Vercel Cron at the same minute, a manual call) run it once. Per-row claims (`metered`, held to sorted) stop double counting and double sends when runs still overlap.
| `heartbeat` | Returns the time; use it to check the scheduler and secret | Optional |

All inputs validated with Zod; every list endpoint is org-scoped in the query, never filtered after the fact.

## 14. What moves to the VPS later (interfaces already in place)

1. KumoMTA/Haraka behind `MailTransport` + `MailEventSource`; DKIM 2048 rotation, IP pools, warm-up scheduler, FBL registration, sending domain (P1) DNS checker.
2. Raw submission replay buffer on R2 + queue when Mongo is unreachable.
3. Per-minute crons (replace the Cloudflare cron worker with systemd timers) and Rspamd, ClamAV (uploads P1).
4. Observability stack and public status page backed by Prometheus.

## 15. Testing and quality gates

Vitest unit tests for each spam signal, event mapping, soft cap, retention, template golden files; the `Db` contract test runs on memory and Mongo drivers for the new collections; Playwright e2e for the no-JS HTML form, the JSON fetch, quarantine release, soft cap hold/release, and every snippet; axe on inbox and landing; k6 script `scripts/load-ingest.js` for the 200 rps target against a preview deploy. Definition of done per milestone is in `CLAUDE.md`.
