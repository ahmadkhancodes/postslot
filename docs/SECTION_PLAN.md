# SECTION PLAN: Postslot by BufferSol landing page

Final for Phase 0 (5 Nov 2026). Palette is violet per DESIGN.md section 10; the hero visual is built in `docs/design/mock.html`.

Layout type A (see DESIGN.md §4). Order follows playbook §4. Copy rules: sentence case, no hyphens inside copy, no exclamation marks, H1 without periods, `text-wrap: balance` on headings. Real facts only; `{{placeholders}}` are listed at the end.

Truth gate: until the own MTA is live, the receipt shows what our mail provider adapter reports (accepted by the recipient's server, deferred, bounced). Do not write "our own mail servers" or show SPF/DKIM/DMARC "live" claims on the page until `{{own_mta_live}}` is true. Copy below is written to be true now and stays true after the move.

## Outline (top to bottom)
1. Floating nav: Pricing, Docs, Compare (menu), Sign in, primary button "Create a form".
2. Hero (split: copy left, live inbox with receipts right; stacked on mobile, inbox cropped to one row plus its timeline).
3. Proof strip directly under hero (facts, no logos).
4. Problem to solution (own words of the buyer).
5. Benefits (4, bento layout, each with proof beside it).
6. How it works (3 steps, each with a UI fragment).
7. Tagline reveal.
8. Proof: comparison fact table (dated, sourced) in place of testimonials; `{{testimonial}}` slots hidden until real.
9. Pricing (from `product.ts`).
10. FAQ (10).
11. Risk reversal band (Free plan, no card, cancel anytime).
12. Final CTA (same as hero).
13. Footer ("A BufferSol product", Privacy, Terms, DPA, Security, Sub-processors, Status).

## 2. Hero
- **H1** (Heading 1, max 680px, line break at the thought):
  `Every form submission delivered`
  `with the receipt to prove it`
- **Subhead** (Body 3, max 680px): "Point any HTML form at Postslot by BufferSol. We filter the spam, deliver to your inbox and stamp every message with its delivery status. Free for 250 submissions a month."
- **Primary CTA:** "Create a form" (links to sign up). Secondary (text link, subordinate): "Read the docs".
- **Under CTA risk reversal:** "Free plan, no card. Spam never counts toward your limit."
- **Proof line** (adjacent, real facts): "Pro is $74 a year for 10,000 submissions a month. Web3Forms Pro is $149 a year for the same 10,000 (checked 3 Nov 2026, not affiliated)." Source link to the compare page.
- **Hero visual:** the inbox component (`InboxPreview`) with believable data: 6 rows, mixed statuses (Delivered, Held over limit, Spam blocked), the first row selected with the receipt timeline and the postmark. Data is fictional and labelled "Sample data" in a caption. At 375 the component crops to selected row + timeline.

## 3. Problem to solution (split, left statement, right three short before/after lines)
Heading: "Your client says the form never works. You cannot prove otherwise."
Lines (buyer words): "Submit button does nothing." / "The email landed in spam, or never left." / "A bot sent 400 messages overnight." Solution sentence: "Postslot gives every submission a receipt: received, sorted, dispatched, accepted. When a client asks, you open the letter and show the time."

## 4. Benefits (bento, 4 cells, varied sizes; benefit in bold, proof beside it)
1. **Prove delivery, per submission.** Each submission has a timeline: received, sorted, dispatched, accepted by the recipient's mail server, with timestamps. Proof beside it: a real timeline fragment with a deferred then accepted example. (Large cell, spans two columns.)
2. **Spam never costs you a submission.** Honeypot, signed time token, self hosted ALTCHA proof of work, rate limits, domain lock and a rules engine. Bots are sorted out before they count; real visitors see no puzzle. Proof: the signal list on a quarantined row ("honeypot filled", "7 links") with a "Not spam" button. Claim limit: never "zero spam".
3. **Busy month, nothing dropped.** Over the limit, legit submissions are held and shown in your inbox, then released when you upgrade or the month resets. Proof: the "Held over limit" row and the usage meter (legit, spam, held). Compare fact: Web3Forms rejects at its cap (brief, dated).
4. **One line to install, every stack.** Snippets for HTML, React, Next.js, Astro, Vue, Svelte, Webflow, Framer, WordPress, plus copy paste prompts for Lovable, Bolt, v0 and Claude Code, with your key already filled in. Proof: the snippet picker UI with the endpoint `https://postslot.buffersoltech.com/f/<form_key>`.
(Smaller supporting row under the bento, text only: 90 day history on the Free plan, CSV and JSON export on every plan, custom sending domain on Pro.)

## 5. How it works (3 steps, horizontal on desktop with connecting ruled line, vertical on mobile)
1. **Paste your endpoint.** UI fragment: the snippet box (code block) with `action="https://postslot.buffersoltech.com/f/<form_key>"` and a Copy snippet button, framework tabs above.
2. **Press Send test.** UI fragment: the "Send test submission" button and the field name linter ("Input `email` has no name attribute" warning).
3. **Watch the stamp land.** UI fragment: the receipt timeline filling Received, Sorted, Dispatched, Accepted with the postmark pressed on. Caption: "Your first stamp appears in a few seconds."

## 6. Tagline reveal (B11, mandatory; Heading 3 on mobile, Heading 2 on desktop, max width 680, word by word from 30% opacity)
"A form that sends is not enough.
You need to know it arrived.
Postslot stamps every submission,
so nothing disappears quietly."
Reduced motion: full colour immediately.

## 7. Proof section: the dated comparison
Heading: "Same endpoint idea, half the price, plus a receipt." Table (Postslot, Web3Forms, Formspree), rows from brief only: Free submissions a month (250, 250, 50), Pro price, submissions at that price (10,000 for $74/yr; Web3Forms 10,000 for $149/yr; Formspree Professional 2,000 for $30/mo), Spam counts toward quota (no, `{{verify}}`, `{{verify}}`), At the limit (held, rejected, `{{verify}}`), Per submission delivery log (yes, no, `{{verify}}`), Free history (90 days, 30 days, `{{verify}}`). Caption: "Checked 3 Nov 2026 from public pricing pages. Not affiliated with Web3Forms or Formspree." Never claim "cheapest" (splitforms and Static Forms are cheaper). Testimonials and case study: `{{testimonial}}`, `{{case_study}}`: hidden until real; no logo wall.

## 8. Pricing (data from `src/config/product.ts`, no new numbers)
- Heading "Half the price. None of the guesswork." Subline (dated, sourced): "Pro: 10,000 submissions a month for $74 a year or $7.49 a month. Web3Forms (web3forms.com) Pro is $149 a year or $15 a month for the same 10,000 (checked 3 Nov 2026)."
- Annual default toggle; state the saving as a number ("monthly is +$1.30 a month versus annual", from brief). Four plans (Free, Starter yearly only $24/yr, Pro featured with border and label "Most chosen" only if real; use "Recommended"), Agency $19.49/mo or $199/yr. Note: playbook says max 3 plans plus contact; the brief prices four, so Starter is a compact row under the Free card on desktop, logged as a decision.
- Price largest element; billing unit under it; limits as plain text; each plan its own CTA verb (Start free, Choose Starter, Choose Pro, Choose Agency); risk reversal under buttons: "No trial needed, the Free plan is the trial. Cancel anytime, export your data."
- Add ons table below (seat $2.49/mo, +10 GB $1.49/mo, white label on Pro $4.49/mo, +25 recipients $2.49/mo). Over limit note: soft cap; optional overage `{{overage_price}}` (workbook est. $0.50 per extra 1,000, not confirmed). Over 20,000: "Contact us for volume".

## 9. FAQ (10, real objections from brief sheets 08/10; FAQ schema)
1. **Web3Forms free already works. Why switch?** It does, and moving is one action URL. Switch if you want a delivery log per submission, 90 days of history on Free instead of 30, and held submissions instead of rejected ones at the limit.
2. **Will the emails land in spam?** We cannot promise inbox placement for any sender. Every email is signed and the receipt shows whether the recipient's server accepted it or deferred it, so you see problems the day they happen. {{own_mta_live}} sender authentication detail once live.
3. **Is it safe to paste the form key in my HTML?** Yes. The key is public by design, like a form action URL. Lock it to your domain in Form, Spam, Allowed domains and it only accepts submissions from there.
4. **What counts toward my limit?** Delivered legitimate submissions. Spam and test submissions do not count.
5. **What happens when I go over the limit?** We keep accepting. Extra submissions are held in your inbox and released when you upgrade or the month resets. You get a notice at 80% and 100%.
6. **Will my AI builder understand this?** Yes. There are copy paste prompts for Lovable, Bolt, v0 and Claude Code with your key filled in, and `llms.txt` docs. AI builders often generate a handler that only logs to the console; the prompt replaces it.
7. **Do real visitors get a captcha?** No puzzle. Our proof of work check runs invisibly and is hosted by us; no request leaves our infrastructure.
8. **What if Postslot goes down?** Ingest is built to keep accepting submissions and replay them; see the status page. `{{uptime_claim}}` only when measured.
9. **Do you offer a DPA, SOC 2 or HIPAA?** A DPA is on every plan. We do not offer SOC 2, SSO or HIPAA forms.
10. **How hard is moving from Web3Forms or Formspree?** Change one action URL and the hidden field names if you used custom ones. Compare pages list the differences. Free 30 minute migration call for agencies with 50 or more client sites.

## 10. Risk reversal and final CTA
Band: "Start on the Free plan. No card, no trial clock. Cancel anytime, export everything." Final CTA headline: "Send your first test and watch the stamp land" button "Create a form" (identical to hero), secondary text link "Read the docs".

## 11. SEO and AEO
- Home title (58 chars): "Postslot by BufferSol: form backend with delivery receipts".
- Meta description (~155): "Point any HTML form at Postslot by BufferSol. Spam is filtered, mail is delivered and every submission gets a delivery receipt. Free for 250 a month."
- Index: yes on home, pricing, docs, compare pages, framework guides, checker tool. Noindex: app, auth, admin, `/f/*`, any time bound campaign page. FAQ schema on home and pricing; SoftwareApplication JSON LD with real offers only. `llms.txt` and `llms-full.txt` kept current. Canonical `https://postslot.buffersoltech.com`.
- OG image: generated from the postmark + H1.

## 12. Compare pages (Type D, ship in M1/M5)
- `/compare/web3forms` "Postslot vs Web3Forms (web3forms.com)": price table, hard cap vs soft cap, delivery log, free history, spam in quota, server side posting; migration steps (one action URL); every cell dated and linked to the source; "Not affiliated" line.
- `/compare/formspree`: price per submission (Formspree Professional $30/mo for 2,000 vs Pro $7.49 for 10,000), custom sending domain tiers, rules engine parity; same dated and sourced treatment.
- Later: Basin, Forminit, Netlify Forms, splitforms (do not fight on price).
- Rules: no competitor logos or trade dress, never "cheapest", only facts from the brief with `{{verify}}` where unconfirmed.

## Placeholders to resolve
`{{testimonial}}`, `{{case_study}}`, `{{own_mta_live}}`, `{{uptime_claim}}`, `{{overage_price}}`, `{{verify}}` cells in the comparison, any user count (none until launch data exists), og image copy approval.
