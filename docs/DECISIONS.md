# Decisions

Standing decisions are in docs/factory/BATCH1_PLAN.md (Mongo instead of Postgres, Better Auth, Stripe first, Mailer interface, Vercel-first, keep 3 deployments).

## Kit v1 (5 Nov 2026)
- **D-K1 Auth = Better Auth 1.7** (magic link, passkey, TOTP, organization, api-key plugins, Mongo adapter; memory adapter in stub mode). Trayo's hand-rolled JWT/refresh/email-code code is NOT ported: Better Auth covers it with httpOnly cookies, and the kit spec + BATCH1_PLAN name Better Auth. Ported from Trayo/Jotflow instead: db interface + drivers + contract test, billing (entitlement recompute, refunds, trial-once, 2022-11-15 tolerance, app isolation), http/HttpError/readJson, ids, env flags, email adapter, consent.
- **D-K2 `__Host-` cookies:** Better Auth only auto-prefixes `__Secure-`; in production we set `useSecureCookies:false` and name each cookie `__Host-<slug>.<name>` with `secure:true, path:/`, no Domain. Dev (http) uses plain names.
- **D-K3 Next 16 Cache Components off:** classic dynamic rendering so `cookies()`/session reads need no Suspense boundaries; a product may opt in later.
- **D-K4 Billing per organization:** the Stripe customer and entitlement belong to the org (`billing_accounts`, `entitlements` keyed by org id), not the user. Multi-tier plans keyed by lookup key; `isPro` became `isPaid` + `plan`.
- **D-K5 Webhook idempotency:** `hasStripeEvent` check first, `markStripeEvent` only after successful processing (fixes the apps' "recorded before, never retried" bug). A failure returns 500 so Stripe retries.
- **D-K6 TTLs are Dates:** `stripe_events.expireAt`, `rate_limits.expireAt`, `webhook_deliveries.expireAt`, Better Auth `session/verification.expiresAt` all have TTL indexes on Date fields.
- **D-K7 Mail templates are plain HTML strings,** not react-email, to keep dependencies small; same `{subject,text,html}` shape so react-email can replace them later.
- **D-K8 Rate limiting in Mongo** (one atomic pipeline update per hit), no Redis dependency.
- **D-K9 Placeholder theme:** neutral greys + muted slate accent `#3d5a80`, Geist + Geist Mono. Products replace only the `:root` blocks and `fonts.ts`.
- **D-K10 Spacing scale enforced at compile time:** `--spacing-*: initial` in `@theme`; off-scale utilities simply produce no CSS.
- **D-K11 Stub mode:** missing `MONGODB_URI` -> memory driver; missing Stripe key -> 503 `billing_unavailable`; console mailer prints bodies only with `MAIL_CONSOLE_PRINT=1`.
- **D-K12 Atlas DB user:** the connector's create-user call needs an interactive confirmation; reported to the orchestrator, running on the memory driver until `MONGODB_URI` arrives.
- **D-P1 Postslot palette (draft, pending orchestrator approval):** the brief's Ledger Green / Archivo / Plex palette is rejected because of the palette registry (no green/teal/navy/amber families). Direction: cool neutral ramp + postmark vermilion action (#B93F17 light, #E8946B dark), danger moved to berry (#A3134A) so the accent never reads as an error. See docs/DESIGN.md.
