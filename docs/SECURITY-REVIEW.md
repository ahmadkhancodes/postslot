# Security review: Postslot by BufferSol (12 Nov 2026)

Adversarial review of the whole app as an attacker with an account. Each finding was attacked live against the local production build (`next start`, memory DB, outbox mail). The exploit was written as a test, failed, then the root cause was fixed and the test passed. Not deployed.

Tests: `tests/e2e/security/exploits.spec.ts` (live HTTP, two workspaces, every role) and `tests/unit/security-review.test.ts`.

## Threat model

**Assets**
- Submissions (leads: names, e-mails, messages) and their delivery receipts, per workspace.
- Recipient addresses and their confirmation tokens; suppression lists.
- Workspace config: forms, domain locks, webhook endpoints and signing secrets, API keys, sender domains.
- Accounts and sessions (magic link, passkeys, TOTP), memberships and roles (owner, admin, member, viewer).
- Billing state: Stripe customer, entitlement (plan, limits, trial).
- Our reputation: the mail servers' IPs and domains (abuse turns into blocklisting), the Stripe account, the founder admin.

**Actors**
- Anonymous internet visitor or bot: posts to `/f/:key`, signs up, hits public endpoints.
- Signed-in user of another workspace (the main attacker): wants other workspaces' data, paid features for free, or to use us to mail or reach third parties.
- A lower-role member of the same workspace (viewer or member): wants admin data or rights.
- Someone holding a stolen cookie, an old magic link or a leaked API key.
- Third parties that call us: Stripe, the mail provider, our own MTA (DSN hook), the cron worker.

**Entry points**
- Public: `/f/:key` (+ `/token`), `/ps.js`, `/api/altcha`, `/api/recipients/verify`, `/api/mail/unsubscribe`, `/api/health`, marketing pages, `/status`.
- Auth: `/api/auth/*` (Better Auth: magic link, sessions, organizations, invitations, API keys, passkeys, 2FA).
- Workspace API (cookie + Origin check): `/api/forms/**`, `/api/submissions/**`, `/api/webhooks/**`, `/api/domains/**`, `/api/audit`, `/api/billing/*`, `/api/account/**`; API key: `/api/v1/me`.
- Founder admin: `/admin`, `/api/admin/*` (`ADMIN_EMAILS`).
- Machine: `/api/stripe/webhook` (signature), `/api/hooks/mail` (Svix), `/api/hooks/dsn` (shared secret), `/api/cron/:job` (`CRON_SECRET`).
- Outbound: webhook POSTs to user URLs, mail to user-supplied addresses, Stripe.

## Findings (fixed)

| ID | Severity | Finding |
|---|---|---|
| S-1 | Medium | Sign-out did not end a stolen session for 5 minutes |
| S-2 | Medium | Viewers and members read the audit log, billing account and webhook endpoints through the account export |
| S-3 | Medium | Webhook SSRF through DNS rebinding (check-then-fetch) and incomplete IP-literal check |
| S-4 | Low | API key permissions did not match the plugin: admins could not create or revoke keys |
| S-5 | Low | CSRF guard skipped for any request carrying an `Authorization: Bearer` header, cookies included |
| S-6 | Low | Unthrottled expensive endpoints: Stripe refresh and 50,000-row CSV export |
| S-7 | Low | Recipient confirmation mail could be used to flood a stranger's inbox |
| S-8 | Info | `/api/cron/constructor` ran `Object` (prototype names treated as jobs) |

### S-1 Session survives sign-out (Medium)
- **Attack:** with a copied cookie pair (XSS elsewhere, shared computer, malware, logs), keep using the account after the victim signs out or revokes the session. Live: after `POST /api/auth/sign-out`, the old cookies still created a form (201) and loaded `/app` (200).
- **Cause:** Better Auth `session.cookieCache` (5 min) trusted the signed `session_data` cookie without reading the session store.
- **Fix:** cookie cache off (`src/lib/auth/index.ts`, D-SEC-1). Sign-out, revocation and account deletion now apply at once.
- **Test:** e2e "a stolen session cookie stops working the moment its owner signs out" (401, `get-session` null, `/app` redirects; the magic link cannot be replayed either).

### S-2 Role bypass through the account export (Medium)
- **Attack:** a viewer invited to a workspace calls `GET /api/account/export` and gets the workspace audit log (who did what, member e-mails), the billing account (Stripe customer id, billing e-mail), the entitlement and every webhook URL, even though `/api/audit` and `/api/webhooks` answer 403. A member also got the audit log.
- **Fix:** `scopeOrgExport` (`src/lib/account-export.ts`) keeps only the sections the caller's role can read in the app: audit log needs `audit:read`, billing `billing:read`, webhooks `webhook:read`, everything else `data:read`. No role means no data.
- **Tests:** e2e (viewer and member against an Agency workspace with a webhook), unit (`S-2`).

### S-3 Webhook SSRF (Medium)
- **Attack:** save a webhook to a host name you control, answer the first DNS lookup with a public address (passes the check), the next with `169.254.169.254` or `10.x` (fetch connects there). Also `https://100.64.0.1/` (CGNAT), `198.18.x` and multicast passed the save-time check (they were only caught at send time).
- **Fix:** production webhook POSTs use `node:https` with `safeLookup`, which refuses any private address at socket connect time, so the checked address is the connected one (`pinnedPost` in `src/lib/webhooks/outbound.ts`). Redirects are not followed, the answer body is discarded unread, 10 s total timeout. The save-time check uses the full private-range table for IPv4 literals (the URL parser already normalises `0x7f.1`, `2130706433`).
- **Tests:** unit `S-3` (literals, rebinding lookup, real local server: status, no redirect follow, private refusal, timeout).

### S-4 API key permissions (Low)
- **Problem:** the API key plugin checks `apiKey: create/update/delete`, our roles only had `read/manage`. Only the owner (creator bypass) could create or revoke keys, while the UI offered it to admins. The UI and the server disagreed about who may manage keys; no escalation was possible.
- **Fix:** owner and admin get `create/update/delete` in `src/lib/auth/roles.ts`; members still only read; viewers nothing.
- **Tests:** e2e (admin creates and deletes a key, member gets 403 on both), unit `S-4`.

### S-5 CSRF guard skipped with a Bearer header (Low)
- **Attack:** a state-changing request carrying the victim's cookies plus any `Authorization: Bearer junk` header skipped the Origin check; `POST /api/forms` with `origin: https://evil.test` returned 201. Browsers need a CORS preflight to add that header and the API has no CORS, so not exploitable from a browser today; it was one CORS change away.
- **Fix:** the key exemption in `assertSameOrigin` (`src/lib/http.ts`) applies only to requests without cookies.
- **Tests:** e2e CSRF test (three origins, with and without the header), unit `S-5`.

### S-6 Expensive endpoints without limits (Low)
- `GET /api/billing/entitlement?refresh=1` called Stripe (customer subscriptions) on every request; a loop could spend our Stripe API rate limit for every customer. Now 10 a minute per workspace (429 + Retry-After).
- `GET /api/submissions/export` builds up to 50,000 rows in memory per call. Now 10 a minute per workspace.
- **Tests:** two e2e tests.

### S-7 Confirmation mail flooding (Low)
- **Attack:** add a stranger's address as a recipient, then press "Resend" every minute (1,440 mails a day per workspace, more with several workspaces). This burns our sending reputation.
- **Fix:** at most 5 confirmation mails per address per 24 hours across all workspaces (`VERIFY_MAIL_RULE` in `src/lib/forms/recipients.ts`), on top of the 1 a minute throttle and 20 new recipients an hour per workspace.
- **Test:** unit `S-7` (8 workspaces, 16 attempts, 5 mails).

### S-8 Cron job lookup by prototype name (Info)
- `cronJobs[job]` resolved `constructor`, `toString` etc. Needs `CRON_SECRET`, so no outside impact. Now `Object.hasOwn`. e2e test.

## Attacked and holding (no change needed)
- **Tenant isolation / IDOR:** with ids from another workspace, every form, submission, recipient, webhook, delivery, domain, export, audit, preview, test, bulk and redeliver route answered 404 or an empty result; Better Auth `set-active`, `get-full-organization`, `list-members`, `invite-member`, `update`, `delete`, API key `list` and `create` refused non-members. Existing e2e (`hardening.spec.ts`) plus the live probe.
- **Roles:** viewer and member cannot invite, change roles, create API keys or use `/api/audit`; an admin cannot invite an owner or promote to owner; the sole owner cannot be removed. Founder routes check `ADMIN_EMAILS` server side (404 for others).
- **Auth:** magic link is single use (replay gives `INVALID_TOKEN`, no cookie), expires in 10 minutes, per-address limit 5 per 10 minutes with the same answer (no enumeration; known and unknown addresses answered alike in ~5 ms). `callbackURL` to `https://evil.test`, `//evil.test`, `/\evil.test`, `javascript:` refused (403); `next` on sign-in and onboarding is same-origin only. Cookies: HttpOnly, SameSite=Lax, `__Host-` + Secure in production.
- **CSRF:** cross-origin, `null` origin and missing origin refused on the app API; Better Auth checks origins on its own routes; text/plain and form-encoded bodies refused (415).
- **Injection:** notification e-mails, invite and magic-link mails escape every value; notification subjects have control characters removed; CSV cells starting with `= + - @ tab CR` are prefixed; the template preview renders in a `sandbox=""` iframe; field names `__proto__`, `constructor`, `prototype` are dropped; every query is built from zod-validated or string values (no operator injection path); search is a parsed text query, not a regex.
- **Form endpoint:** posted `redirect` only to the form's allowed origins, the posting origin or our host; honeypot, ALTCHA (single use), signed time token, per-IP and per-form limits, 100 KB and 25 field caps.
- **Webhooks in:** Stripe signature on the raw body with the SDK tolerance, idempotent by event id, entitlement recomputed from Stripe (order independent), other apps' customers ignored. Mail events: Svix signature, 5 minute tolerance. DSN: constant-time shared secret.
- **Billing tampering:** checkout takes only plan and interval names; price, trial and quotas come from the server; limits are enforced on form, recipient, webhook, seat and domain creation.
- **Data exposure:** no source maps in `.next/static`; no secret values in the client bundle (`bundle-secrets.test.ts`); API errors are `{error: code}` with no stack; `/api/health` shows states, not hosts or keys; logs mask e-mails.
- **Headers:** CSP, HSTS (preload), nosniff, frame-ancestors none, X-Frame-Options, Referrer-Policy, Permissions-Policy, COOP on every route. The CSP still covers every origin the app uses (Vercel Analytics and Stripe Checkout redirects); `hardening.spec.ts` fails on any CSP violation in a real browser.
- **Dependencies:** `npm audit --omit=dev`: 0 vulnerabilities.

## Open, needs a decision (recommendations)
- **S-9 Client IP trust (Medium if the app moves off Vercel).** Rate limits key on the first `x-forwarded-for` entry. Vercel overwrites that header, so it cannot be spoofed there. Behind nginx or another proxy on a VPS it can, which would bypass every per-IP limit. Recommendation: before any route moves, add a `TRUSTED_PROXY_HEADER` setting and read only that header (D-SEC-5).
- **S-10 CSP allows inline scripts.** `script-src 'unsafe-inline'` is needed by statically rendered Next pages. A nonce CSP would force every page dynamic (slower marketing pages). Recommendation: keep it for now; React escaping and no `dangerouslySetInnerHTML` with user data keep the XSS surface small. Revisit with Next's static nonce support.
- **S-11 Login CSRF through magic links.** Anyone can send a victim their own magic link, so the victim ends up signed in to the attacker's account. Common to all magic-link products. Recommendation: a "Continue as name@x" confirmation page before the session is created, if this ever matters to customers.
- **S-12 Dev dependency advisory.** `npm audit` (dev) reports minimatch ReDoS through the eslint toolchain; the only fix is a breaking `eslint-config-next` downgrade, and it never runs in production. Left as is; recheck on the next Next.js upgrade.
- **S-13 Body size checks on chunked requests.** `readJson` reads the whole body before comparing it with 1 MB when there is no `Content-Length`. Vercel caps bodies at 4.5 MB, so it is bounded. On a VPS, add a proxy body limit.
- **Entitlement visible to viewers.** `GET /api/billing/entitlement` shows plan name and status to every role (the usage banner needs it). No PII or Stripe ids. Accepted.
