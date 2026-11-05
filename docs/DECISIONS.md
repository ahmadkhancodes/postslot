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
- **D-P1 (final, supersedes the draft above) Postslot palette = postmark violet.** The draft vermilion #B93F17 was within 4 hue degrees of Straightpin tomato #B8381C, so it is replaced: action #6B3FC4 light / #B49AF0 dark, danger a true red #B3261E / #F2766E, cool neutral ramp, Geist + Geist Mono. Contrast re-computed in docs/DESIGN.md; distinctness table vs the six sibling colours in DESIGN.md section 10. The brief's Ledger Green / Archivo / Plex stays rejected.
- **D-P2 Architecture deviations from the brief:** ingest as a Next.js route handler on Vercel (not a Worker); Mongo instead of Postgres (search via compound text index, Atlas Search as the swap); token Bayes in Mongo instead of Rspamd (P1 per FR-13); delivery events normalised as `MailEvent` so a provider webhook now and KumoMTA/Haraka later share one path. Full table in docs/ARCHITECTURE.md section 0.
- **D-P3 Truth gate:** until the own MTA is live, copy says "accepted by the recipient's mail server" only; no "own mail servers" or live SPF/DKIM/DMARC claims (flag `own_mta_live`).
- **D-P4 Mock fonts:** docs/design/mock.html falls back to system faces (no network); production uses Geist as in DESIGN.md.

## M1 storefront (5 Nov 2026)
- **D-M1-1 Landing order:** hero (inbox with receipt) then stat strip, inbox explainer with the one line install snippet, then problem, bento benefits, how it works, tagline reveal, dated comparison, pricing, FAQ (10), risk band, final CTA. Kit sample landing and `demo/submission-inbox.tsx` replaced by `demo/inbox-preview.tsx`, `postmark.tsx`, `receipt.tsx`.
- **D-M1-2 Plans:** product.ts already matched the brief in cents; added `meter` (submissions per month, spam and tests not counted, over limit = held) and `addOns`. Pricing page shows annual by default, "Recommended" label on Pro, Starter stays a normal card (four column grid) rather than a compact row.
- **D-M1-3 Testimonial slot removed:** the kit `Proof` component is not rendered; the dated comparison table is the proof section (plan section 7). No logos, no testimonials.
- **D-M1-4 Compare data:** Web3Forms facts only from docs/brief.md (checked 3 Nov 2026); unconfirmed cells stay `{{verify}}`. Landing three way table includes Formspree facts from the brief (Free 50, Professional $30 for 2,000).
- **D-M1-5 Legal:** retention by plan, meter and held submissions in Terms, receipts in DPA. `{{jurisdiction}}`, `{{registered address}}`, `{{refund policy}}`, `{{cap}}` kept and listed in MANUAL_STEPS.md. Subprocessor email line no longer mentions own mail servers (truth gate D-P3).
- **D-M1-6 Kit fixes:** two layout bugs fixed in kit components (mobile header buttons, compare table overflow) because they broke the 375 requirement.
- **D-M1-7 Docs:** new `/docs/install` page (HTML, React, Next.js, Astro, Vue, Svelte, Webflow, Framer, WordPress, AI builders); getting started rewritten for the form endpoint; `llms.txt` lists pricing, endpoint and compare pages. The `/f/<form_key>` ingest itself arrives in M2.
