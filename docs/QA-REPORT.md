# QA report: battle test of every P0 journey (12 Nov 2026)

Method: the production build (`next start`, memory driver, `E2E_OUTBOX=1`, console mail) driven by real Playwright clicks as the ICP (freelance dev, agency owner, AI-builder user). Specs live in `tests/e2e/qa/`; the whole suite (27 tests, one worker) and the unit tests are green. Not deployed.

## Journeys covered (one line each)
- **Visitor, signed out** (`crawl.spec.ts`): every public page at 375 and 1440: status 200, one h1, no horizontal scroll, accessible names, pointer cursor, no console errors, every internal link live.
- **Protected routes** (`crawl.spec.ts`): `/app`, `/app/*`, `/admin` bounce to sign-in and return to the page asked for after the magic link and org creation.
- **Landing to sign-up** (`journeys.spec.ts`): hero CTA, pricing prices (yearly and monthly) equal `product.ts`, plan CTA goes to sign-in, bad/blank/hostile/throwaway e-mails explained, reused and tampered magic link lands on "That link has expired".
- **Free user, first form to first lead** (`journeys.spec.ts`): create forms (empty, whitespace, duplicate, HTML, unicode, 80 chars, over 80), double click, recipient limit message, test submission, public posts, inbox, search (hit, miss, HTML shown as text), CSV and JSON export, detail view.
- **Public endpoint** (`endpoint.spec.ts`): HTML post 303, JSON, CORS and preflight, hostile and oversize bodies (413, 422), bad JSON, unknown key, honeypot, 429 with Retry-After, domain lock (403/200), paused form (403) from the settings UI.
- **User at the plan limit** (`limits.spec.ts`): founder lowers the cap to 3, six posts all answered 200, three held, inbox "Held 3" and upgrade link, billing button without Stripe explains itself.
- **Spam** (`interactions.spec.ts`): link-stuffed post is quarantined, "Not spam" releases it into the inbox.
- **Paid plan** (`paid.spec.ts`): second recipient waits for confirmation, no content mailed before it, confirm page (a real form POST), reused confirm link, webhook URL validation (SSRF targets refused), account deletion needs the typed phrase, signs out, the old endpoint answers 404.
- **Team and admin** (`team-admin.spec.ts`): non-admin gets 404 on `/admin` and 4xx on admin actions; founder searches, overrides the plan with a reason, the customer sees Pro; suppression list; invite on Free explains the seat limit, on Pro the invitee accepts and as viewer cannot create forms.
- **Account** (`journeys.spec.ts`): profile save and reload, TOTP setup start, API key create and delete dialog closes on Escape, invitation, delete dialog stays disabled, sign out then protected pages bounce.
- **Tenant isolation** (`journeys.spec.ts`): another workspace's form pages show the calm 404 and no data, PATCH and DELETE are refused, export has no foreign rows, `/admin` and admin API refused.
- **Chrome and a11y** (`interactions.spec.ts`, `limits.spec.ts`): mobile menu opens, closes on Escape and every link works; copy buttons really copy; all ten install tabs carry the real key; CSV link downloads; back and refresh keep pages usable; checkout return states; skip link first in tab order, focus ring visible, no tap target under 44px at 375px on app and marketing pages.
- **Numbers vs code** (`tests/unit/docs-match-code.test.ts`): docs and plan highlights quote the limits the code enforces.

## Defects found and fixed
1. **Double click created two forms.** Two quick clicks on "Create form" sent two POSTs (the busy state re-rendered too late). Same risk on every write button. Fix: `api()` in `src/components/app/api.ts` shares an identical in-flight write. Regression: `journeys.spec.ts` (double click), `interactions.spec.ts` (double click on sign-in and org creation).
2. **Sign-in said "Check your inbox" for an impossible address** (300 characters before the @), creating junk accounts and a mail that can never arrive. Fix: client check for 254 total / 64 local part. Regression: `journeys.spec.ts`.
3. **Tap targets under 44px on mobile**: small buttons (Copy URL, Copy snippet, Remove, Resend), the Monthly/Yearly toggle in billing and the logo links in app, auth and footer were 28 to 32px high. Fix: `Button size="sm"` is 44px below `md`, toggle and logo links `min-h-11`. Regression: `limits.spec.ts`.
4. **Hydration error #418 on the form page**: the ALTCHA hint rendered `product.url` in a client component, which can differ between the server and the browser bundle when the public URL is set at runtime. Fix: use the origin of the endpoint passed from the server. Caught by the console-error check in `crawl.spec.ts`.
5. **Test outbox empty in some builds**: the in-memory mail outbox lived in a module the bundler could duplicate, so the e2e mail endpoint saw nothing and sign-in through the UI could not be tested. Fix: outbox on `globalThis` (`src/lib/mail/transports.ts`). Test-only path, no production effect.
6. **"Open" links in the admin workspace table had no context** for screen readers. Fix: `aria-label="Open workspace <name>"`.
7. **Test hygiene:** `playwright.config.ts` now runs one worker, and `m4.spec.ts` signs in its second user from its own client IP, because Better Auth rate limits sign-in and verification per IP and parallel specs shared one (flaky 429). No assertion was weakened.

## Left open (no code change, needs a call)
- **Low**: pages under `/app` that call `notFound()` stream with HTTP 200 (the shell with `loading.tsx` is already sent) and show the 404 screen. Behind login, no SEO impact; a status-correct 404 needs dropping the app-level `loading.tsx` or checking ownership in the layout.
- **Low**: two forms may share a name (inbox form filter then shows two "Contact page"). Left as is; a suffix or uniqueness rule is a product decision.
- **Low**: the Svelte install tab is identical to the HTML tab.
- **Low**: the 254/64 e-mail length check is client side only; the sign-in API itself still accepts longer addresses (only matters for direct API callers).
- **Info**: `type=url` fields (webhook URL, success URL) rely on the browser's own validation bubble for clearly malformed input; server-side refusals show a sentence.
- **Info**: behind a proxy that does not forward the client IP, all visitors would share one sign-in rate-limit bucket. Vercel forwards it, so no action.
- **Not testable here**: Stripe Checkout round trip and portal (no key), real provider mail, the Mongo driver, Lighthouse.
