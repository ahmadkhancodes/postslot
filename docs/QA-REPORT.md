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

## Hardening round (12 Nov 2026)
Real browser: system Chromium via `PW_CHROMIUM=/usr/bin/chromium npx playwright test` (config passes it as `executablePath`). Full suite: 34 Playwright tests, 269 unit tests, lint (0 errors), typecheck and build green. Not deployed.

New specs `tests/e2e/hardening.spec.ts` (7 tests): CSP console check across marketing, auth, inbox and every form tab; billing button gives an answer; inbox first-run checklist and keyboard shortcuts; `/api/health` content; tenant isolation by guessed ids (read, action, bulk, PATCH, UI); cleared session gives 401 JSON and the sign-in page; magic-link flood sends five mails and answers identically. New unit file `tests/unit/hardening.test.ts` (CSP vs source, health, logs, 503 mapping, key-guess 429, hostile/unicode/huge input, real Stripe signatures incl. replay, mark-spam period, stuck rows, export, link clock skew, checklist, shortcuts, bulk isolation) and `tests/unit/bundle-secrets.test.ts`.

Findings: no CSP violation in any page; the built bundle holds no secret (only better-auth's empty env accessor name). Keyboard shortcuts initially ignored because the always-rendered mobile drawer counted as an open modal (now checks visibility). Test-only: `limits.spec.ts` now ignores the expected generic 503 console line from billing without Stripe (the response-level check is unchanged).

Not testable here: Stripe Checkout round trip, real provider mail, Mongo driver (index/aggregate behaviour, slow-DB timing beyond the mapping tests), Lighthouse.

## Post-redesign regression pass (12 Nov 2026)
Specs: `tests/e2e/qa2/redesign.spec.ts` (4 tests) on top of the earlier `qa/` journeys, which already click every P0 journey as visitor, free user, user at the limit, paid, team and admin. Unit guard: `tests/unit/brand-consistency.test.ts`. Result: lint 0 errors, typecheck, 272 unit tests, build, 38 Playwright tests green. Not deployed.

Covered: every public page plus the 404 at 375 and 1440 (body background light, `color-scheme: light`, H1 serif and body sans, no radius above 4px except round elements, no violet, no clipped text, no horizontal scroll, no console errors or hydration warnings); every `/app` screen signed in (200, brand, no scroll, no console errors); mobile menu closes on Escape and Tab shows a visible focus ring; OG, twitter, icon and apple-icon routes answer 200.

Defects found and fixed:
1. **E-mails still had the old brand** (violet "test submission" banner `#f1eefb`/`#3b2a7a`, cold greys `#181818 #f7f7f7 #f6f6f8 #17181c`, 8px radius, system sans headings). Magic link, invite, notice, submission (default and compact), recipient-confirm and owner-notice mails now use ink `#1a1d24`, stone `#f6f5f1`, rules `#e4e2dc`, manila for the test banner, 2 to 4px radius and a Georgia serif heading (web fonts do not load in mail clients).
2. **Raw HTML responses** (form endpoint error/thanks page, unsubscribe page) used default system styling and a blue link; now ink text, serif heading, rust link.
3. **`global-error.tsx`** replaces the root layout, so it lost the three font variables and fell back to Georgia/system; it now loads them.
Regression: `brand-consistency.test.ts` fails on any old hex, "geist/violet/purple/indigo" in `src`, on a global error without fonts, and on rendered mails missing the ink/stone colours. `m3.test.ts` updated for the new rule colour (assertion not loosened).

Left open:
- **Low**: mail HTML cannot use Newsreader/Schibsted (no web fonts in mail clients); Georgia and the system sans are the closest safe fallback.
- **Low**: the dev outbox endpoint exposes text only, so mail HTML colours are checked at unit level, not in the browser.
- Earlier open items above are unchanged. Stripe Checkout round trip, real provider mail, Mongo driver and Lighthouse remain untestable here.

## Usefulness pass: first ten minutes, working docs, billing path (12 Nov 2026)
Specs: `tests/e2e/usefulness/personas.spec.ts` (3 personas), `tests/e2e/usefulness/docs-run.spec.ts` (every code sample), `tests/e2e/billing/upgrade.spec.ts` (upgrade journey against a local Stripe stand-in), unit `tests/unit/usefulness.test.ts`. Screenshots `docs/qa/usefulness/` (375 and 1440, light). Not deployed.

### Personas, a week each
- **Jake, freelance developer (Austin), moving client sites off Formspree.** Day 1 before: empty inbox, link to Forms, type a name, create, land on install, switch to "Check and test", send test (5 clicks plus typing). His Formspree form needed hand edits: action, method, and `_next` was ignored so visitors lost their thank-you page. Day 2: API key created, but the docs curl still said `YOUR_API_KEY` and the base URL had to be pieced together. After: 2 clicks to the first receipt; the check gives a corrected form; `_next` works; the key page shows a ready curl.
- **Maya, non-technical founder on Lovable.** Day 1 before: the in-app install picker had no AI-builder prompts (only the docs page, with a `<form_key>` placeholder to edit by hand); the "fetch" tab used `email` and `message` variables it never defined, so a builder pasting it got a ReferenceError. Day 2: adding her co-founder as a second recipient on Free said "upgrade" with no link and no plan named. After: Lovable, Bolt, v0 and Claude Code tabs carry her real endpoint; fetch and React snippets run as pasted; the limit message names the plans and links to billing.
- **Tom, agency owner (UK), 3 client sites.** Day 2: the members page says the seat count before he invites (fine). Day 7 before: 252 posts in a launch week, banner says "over your limit", billing showed the meter but not how many leads were waiting or which plan would take them; coming back from Stripe with Cancel showed nothing. After: billing says "2 submissions are waiting over your limit. Upgrading to Starter releases them right away", Starter is marked "Fits your usage", and a canceled checkout says nothing was charged.

### Top five fixed (by impact)
1. **Fewer steps to first value**: first form created from the empty inbox (name pre-filled), test button on the install page until the first submission. Click budget 2, asserted.
2. **Import from what they use**: Formspree/Web3Forms/FormSubmit field names understood (D-U1); the form check returns a corrected copy of a pasted form with a copy button; migration and special-field docs updated.
3. **Snippets correct as pasted**: fetch snippet self-contained, React snippet no longer reads `currentTarget` after `await`, all executed against the app.
4. **Personalised snippets**: AI-builder prompt tabs in the app with the real endpoint; curl with the real key after creating an API key (one helper shared with the docs).
5. **Day-7 decision glue**: held count and plan hint on billing, plan-limit message with plan numbers from code and a "See plans" link, "Checkout canceled" notice.

### Docs must work
`docs-run.spec.ts` takes every code sample from the docs content, checks it is shown on its page, personalises it (form key, API key, base URL) and runs it: HTML and framework forms are rendered and submitted in Chromium (JSX reduced to its markup), curl commands are parsed and sent, JSON examples compared with the real `/api/v1/me` answers (success and `invalid_api_key`), the subject template is set on a form and the sent subject read from the outbox, AI prompts checked for the endpoint and a live `/llms.txt`. Same for the landing install snippet and all 14 in-app install tabs (fetch tab runs its script). Every resulting submission is found in the CSV export. The Node webhook verifier runs in the unit test against the app's real signer (the app refuses webhook delivery to localhost). `llms.txt` prices and limits checked against `product.ts`; pricing page and limits docs were already covered (`journeys.spec.ts`, `docs-match-code.test.ts`). `docs/*.md` hold internal ops docs only (no customer quickstart).
Doc defects found: Formspree `_next` was documented as unsupported and Web3Forms users were told to delete `access_key` by hand (now supported/ignored); in-app fetch snippet did not run.

### Billing path
`upgrade.spec.ts` against `fake-stripe.mjs` (D-U3): Cancel at Checkout returns to billing with a notice; Pro yearly from the pricing hand-off creates a subscription Checkout Session with price `postslot_pro_annual`, `metadata.app=postslot` (session, subscription and customer), org id as client reference, success URL with `{CHECKOUT_SESSION_ID}` and the cancel URL; only `postslot_` lookup keys are asked for; an unsigned webhook is refused (400); signed `checkout.session.completed` activates Pro and its limits (10,000 submissions, 5 recipients); "Manage billing" opens the portal for the same customer with the billing return URL; `cancel_at_period_end` shows "Ends on"; `customer.subscription.deleted` drops to Free. No product gap found beyond the missing cancel notice. Not testable here: real card entry and Stripe's own hosted pages.

### Test hygiene
`signInUI` now waits for a new magic link instead of reusing the last one in the outbox (the founder address is used by several specs and hit the per-address limit, then signed in with a stale link). `interactions.spec.ts` "Released" check targets the status message (two elements matched once the receipt rendered quickly; still strict). Install tabs got `min-w-11` (the "v0" tab was 41px wide).

### Left open
- The React snippet's fetch handler is not executed in a browser (needs a JSX build); its markup is, and the JSON post path runs through the docs curl.
- Members page: an invite on a full Free seat can still be sent (the page says it cannot be accepted); blocking it up front is a product call.
- Seats meter on billing reads "0 of 1" for the owner alone (seat counting excludes the owner or counts only invites; unchanged).
- Earlier open items above are unchanged.
