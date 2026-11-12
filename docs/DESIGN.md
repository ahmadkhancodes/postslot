# DESIGN: Postslot by BufferSol

Phase 0, final 5 Nov 2026. Binding for all UI. Follows `docs/factory/DESIGN_PLAYBOOK.md` and `.claude/skills/landing-page-design/SKILL.md`. Reference mock: `docs/design/mock.html` (+ `mock-1440.png`, `mock-375.png`).

Deliberate divergence from `docs/brief.md` "Design direction": the brief's Ledger Green / Archivo / Public Sans / IBM Plex Mono palette is **rejected** (orchestrator palette registry bans green/teal families and the "warm paper + dark green + condensed display + mono" batch default). The brief's concept (the Mail Room, postal verbs, delivery stamp) is kept and sharpened. Logged in `docs/DECISIONS.md` by the build session.

## 1. Research (live sites, fetched 5 Nov 2026)

Fetch tooling returned page text and some CSS only; no screenshots, so "palette/type" cells are filled only where the HTML or CSS showed it, otherwise marked "n/v" (not verified). Web3Forms returned 403 to automated fetch; its row relies on `docs/brief.md` sheet 19.

| Site | Hero claim | Hero visual | Palette / type | Density | Proof style |
|---|---|---|---|---|---|
| Web3Forms | "Form backend for static sites" family of claims, free tier, one endpoint (brief) | Big code snippets, stat band | White page, generic Tailwind look (brief, n/v) | Medium, FAQ accordion | Counts: 412,000+ users, 13.2M+ emails (claimed) |
| Formspree | "The production-ready form backend" | Code samples (HTML, AJAX, React) | CSS: warm off white #F3F3F0, ink #1C1B1F, red #DF102C, gold #E8C26A; display face Degular, Geist for UI | High: 20+ integrations, lists | "5 million submissions last month", named enterprise customers, SOC 2 Type II |
| Basin | "Point any form at Basin. Or build one here." | "Try the demo" product thumbnail | n/v | Sparse hero, dense scroll | "35,000+ agencies", logo grid, named testimonials |
| Static Forms (now staticforms.dev) | "One endpoint for your HTML forms." (under 60 seconds) | Workflow diagram: form, spam check, inbox and tools, AI reply; then inbox and rules UI mockups | n/v | Sparse hero, dense page | 2.5M+ submissions, 30K+ developers, 99.99% uptime, framework list |
| splitforms | "Free Contact Form Backend for Any Website" | Two product screenshots (form builder, analytics) | n/v | Sparse hero, long feature lists | Concrete numbers, comparison table, avoids testimonials |
| Resend (adjacent, loved by ICP) | "The email API for developers" | Code and product index | CSS: black/white, greys #A0A0A0 #6C6C6C, Commit Mono for code | High, link dense | Customer story, SDK list for 9 languages |
| Linear (adjacent) | "The product development system for teams and agents" | Real product UI (issue lists, detail), "Fig 0.1" captions | Dark, restrained (n/v exact) | Dense UI, spacious copy | Named testimonials, logo strip, "50,000 product teams" |
| Vercel (adjacent) | "Agentic Infrastructure" | Text led | Black/white (n/v) | Low to moderate | Named customer metrics (Notion, Zapier, Mintlify) |

**Category cliche (what everyone shares):** (1) the hero explains the product with a code snippet or an abstract "form to inbox" flow diagram; (2) the story ends at "email arrives", nothing shows what happened to one specific submission; (3) trust is built by volume claims and logo walls (30K developers, 99.99%), not by evidence about the user's own mail; (4) generic SaaS surfaces: white page, one blue or red button, feature checkmark grids; (5) accent hues are blue/indigo (default Tailwind look) or Formspree's crimson.

**The gap Postslot owns:** the **receipt**. Nobody renders the life of a single submission (received, sorted, dispatched, accepted by gmail-smtp-in at 14:02:07) as the primary object. The product becomes a ledger of letters, each with a postmark, not a pile of rows. Evidence over volume claims.

## 2. ICP card

Primary: a freelance web developer (1 person, Austin or Leeds, 5 to 40 client sites) or the lead developer at a 2 to 25 person web agency. Buys with a personal or company card, $24 to $199 a year, no procurement, decides in one sitting after reading docs. Fears: the client emails "we got no leads" and the dev cannot prove the form worked; spam floods; being billed per surprise; a form service dying and taking 30 client sites with it. Already loves: Vercel, Linear, Resend, Astro/Next.js docs, Stripe docs; lives in an editor and a terminal; reads Reddit r/webdev and docs pages on a desktop, then pastes a snippet. Secondary: AI builder users (Lovable, Bolt, v0) on a phone or laptop, non technical, who need a prompt to paste. Reading context: desk, dark editor open beside the browser; phone for client "is it working?" checks.

## 3. Positioning

For freelance developers and small agencies who ship contact forms on static and AI built sites, Postslot by BufferSol is the form endpoint that stamps every submission with a delivery receipt (received, sorted, accepted by the recipient's mail server), keeps spam out of your 250 free monthly submissions, and holds over limit submissions instead of dropping them, unlike Web3Forms and Formspree, which show you a count but never prove one message arrived.

## 4. Layout type

**Type A, classic hero plus sections**, with a **D-style compare strip** reserved for dedicated compare pages. Reason: the product is understandable from one hero screenshot (the inbox with receipts), the ICP arrives from "web3forms alternative" search and wants the pricing and code fast, and the long-story type B would hide the 3 step install. Compare pages ship as separate Type D pages (see SECTION_PLAN).

## 5. Visual direction

| Axis | Decision | Why |
|---|---|---|
| Concept | "The postmark": every submission is a letter; the receipt is the product | Brief concept, sharpened to one ownable object |
| Palette | Cool neutral ramp, ink text, ONE accent **Postmark violet** (action #6B3FC4; the colour of a stamp pad), danger stays a true red (#B3261E) | Not green, teal, navy, amber, near black or tomato (see section 10); violet is classic stamp ink and is not the default blue/indigo of the category |
| Surfaces | Flat. Hairline 1px borders, zero decorative shadow (one `shadow-raised` for popovers) | Dev tool trust, playbook flat rule |
| Dark mode | None. The product is light only (founder decision, D-L1) | Owner rule |
| Type | **Geist** (one family) 400/500/600, **Geist Mono** only for form keys, IDs, timestamps, code, the postmark | Whitelist; dev ICP; mono is functional |
| Radius | Sharp: controls 4px (`rounded`), panels 8px (`rounded-lg`), postmark and avatars circular. Nested: inner = outer minus gap, only if greater than 2, else square | Dev/enterprise personality |
| Density | High in product UI (40px ledger rows, tabular numerals), spacious marketing sections | Linear/Resend pattern |
| Imagery | Real product UI components only. No stock, no illustrations of people, no 3D. Monoline mail slot drawing only as the 404 | Playbook |
| Icons | Phosphor, Regular weight, 20px, `currentColor`. No icon in a circle on cards | Playbook B6 |
| Motion | Low. One signature (postmark press, 500ms, `cubic-bezier(0.22,1,0.36,1)`, transform+opacity), scroll reveals 32px rise once, tagline word reveal. Reduced motion: opacity only | Playbook B7 |
| Tone | Calm exact postmaster. Plain English, numbers over adjectives, postal verbs (received, sorted, delivered, returned). Never "magical", "AI powered", "seamless" | Brief voice |

## 6. Tokens (map 1:1 to `src/app/globals.css`)

Replace only the values in the two `:root` blocks. Names unchanged. Additive tokens (marked +) are new names; add them to the `@theme inline` block as `--color-*` too.

### Raw ramp (light-leaning cool neutral; same in both modes)
| Token | Hex | | Token | Hex |
|---|---|---|---|---|
| `--n-0` | #FFFFFF | | `--n-600` | #55585F |
| `--n-50` | #F6F6F8 | | `--n-700` | #3D4047 |
| `--n-100` | #EEEEF1 | | `--n-800` | #272A30 |
| `--n-200` | #E1E2E6 | | `--n-900` | #17181C |
| `--n-300` | #C9CBD1 | | `--n-1000` | #000000 |
| `--n-400` | #A1A4AC | | `--accent-500` | #6B3FC4 |
| `--n-500` | #6B6E76 | | `--accent-600` | #5E34B1 |

### Role tokens
| Token | Light |
|---|---|
| `--surface` | #FFFFFF (n-0) |
| `--surface-raised` | #F6F6F8 (n-50) |
| `--surface-sunken` | #EEEEF1 (n-100) |
| (removed) dark sidebar tokens | the app sidebar is white with hairline borders |
| `--text` | #17181C |
| `--text-subtle` | #55585F |
| `--text-muted` | #6B6E76 |
| `--text-inverse` | #FFFFFF |
| `--border` | #E1E2E6 |
| `--border-strong` (inputs, UI parts, 3:1) | #8A8D96 |
| `--action` | #6B3FC4 |
| `--action-hover` | #5E34B1 |
| `--action-text` | #FFFFFF |
| `--focus` (ink ring, never the accent) | #17181C |
| `--success` / `--success-surface` | #1F7A3A / #E8F5EC |
| `--warning` / `--warning-surface` | #8A5A00 / #FDF3DC |
| `--danger` / `--danger-surface` | #B3261E / #FCEBEA |
| `--hero-from` / `--hero-to` | #000000 / #666666 |
| `--action-surface` + (tint behind postmark, selected row) | #F1ECFB |
| `--code-bg` + | #17181C |
| `--code-text` + | #E9EAEE |
| `--code-accent` + (keys, strings in code) | #B49AF0 |
| `--code-muted` + | #9A9DA6 |
| `--shadow-color` | 0 0% 0% |

Accent saturation (HSL): 53%, hover 55% (all below 80). Danger hue 3 vs accent hue 258 to 260: far apart, and danger always appears with the octagon icon and the words "Bounced", "Failed" or "Returned"; the accent is never used to color a status chip, an error message, or a destructive button (destructive = danger red).

### Contrast (WCAG 2.x, computed with the relative luminance formula)
| Pair | Light | Need |
|---|---|---|
| `action-text` on `action` (button) | 6.70 (#FFF on #6B3FC4) | 4.5 |
| `action-text` on `action-hover` | 8.07 | 4.5 |
| `action` on `surface` (links, outlines) | 6.70 | 4.5 |
| `action` on `surface-raised` | 6.21 | 4.5 |
| `action` on `action-surface` | 5.79 | 4.5 |
| `danger` on `surface` | 6.54 | 4.5 |
| `danger` on `danger-surface` | 5.67 | 4.5 |
| `text`, `text-subtle`, `text-muted`, `border-strong`, `focus`, `success`, `warning` pairs | unchanged from the neutral ramp, verified in the Phase 0 draft (text 17.74, subtle 7.12, muted 5.10 on surface; border-strong 3.32) | 4.5 / 3 |

## 7. Type: named styles

Geist loaded once (variable, weights 400, 500, 600). Geist Mono 400 and 500. Use the existing named utilities from globals.css; no loose size or weight.

| Where | Style |
|---|---|
| Hero H1 | `heading-1` desktop, `heading-3` at 375 (one step down, not off scale). Hero gradient text allowed (only gradient) |
| Section heads | `heading-3` (`heading-5` mobile) |
| Card and panel titles, nav, table column heads | `title-3` / `title-4` |
| Running text | `body-3`; dense UI text `body-6` |
| Buttons | `button-md` (header `button-sm`) |
| Timestamps, helper, chips | `caption-2`, `caption-3` |
| Mono (Geist Mono) | form keys, submission IDs, timestamps in the timeline, endpoint snippet, postmark text: sizes `text-sm` / `text-xs` only, weight 400/500 |
| Banned | italics, 900, loose sizes, any second family, hyphens inside copy, orphans (`text-wrap: balance` / `pretty`) |

## 8. Signature move: the postmark receipt

Every submission shows a **postmark**: a circular stamp in `--action` ink (violet) (Geist Mono, uppercase, text on a ring: `POSTSLOT · DELIVERED`, centre `14:02:07` and date, flanked by four wavy cancellation lines like a real cancel). It is the status, the timestamp and the proof in one object. It appears:
1. In the landing hero: the first row of the live inbox is a submission that "arrives"; the postmark presses onto it (scale 1.06 to 1, opacity 0 to 1, 500ms on the base curve, once) as the timeline fills Received, Sorted, Dispatched, Accepted.
2. In the app, on the submission detail, and as the "Send test submission" reward (the aha moment).
3. In every notification email footer (static image) and on the public status page.
Variants by state, always with icon and word, never colour alone: Delivered (violet ring), Held over limit (amber outline ring, dashed), Spam blocked (neutral ink ring, struck), Returned (red ring, "RETURNED"). Reduced motion: the postmark is static and visible.

## 9. Differs from the 3 closest competitors

Closest: **Web3Forms** (the leader we challenge), **Formspree**, **Static Forms / splitforms** (cheap, product-led).

| Axis | Web3Forms | Formspree | Static Forms / splitforms | **Postslot** |
|---|---|---|---|---|
| Hero visual | Code snippets, stat band | Code samples | Workflow diagram, builder screenshots | A real inbox where one submission gets its receipt |
| Palette | White, generic Tailwind blue (brief) | Warm off white, ink, crimson #DF102C, gold | n/v, price led pages | Cool neutral + ink + violet #6B3FC4, danger in red |
| Type | System/generic sans (brief) | Degular display + Geist | n/v | Geist + Geist Mono only, no display face |
| Proof | Volume counts | Volume counts, SOC 2 logos | Volume counts, comparison tables | The evidence of one message: SPF/DKIM/DMARC pass shown live, timeline, dated source links, no logo wall |
| Signature | none | none | none | The postmark receipt |
| Layout | Generic SaaS stack | Dense feature index | Price and feature tables | Product-first split hero, ledger rhythm, bento benefits, no three equal cards |

We differ on at least five axes from each (hero visual, palette, type, proof, signature).

## 10. Palette distinctness check (BufferSol registry)

The draft accent vermilion #B93F17 was **rejected in the final pass**: it sits 4 hue degrees and 1 saturation point from Straightpin tomato #B8381C. Replaced by violet #6B3FC4 (hue 260). Hue distance of Postslot's accent to each sibling, computed from the hexes:

| Product | Colour | Hue | Distance from Postslot violet (hue 260) |
|---|---|---|---|
| DockCrate | dock green #1F5C4A | 162 | 98 |
| Stepclimb | teal #0B5D6B | 189 | 71 |
| Hotrail | signal navy #14284B | 218 | 42, but navy is 19% lightness and violet is 51%; the violet is a mid tone with a clearly red shifted hue; never used as a fill for large surfaces |
| Inboxwire | amber #F5A524 | 37 | 137 |
| Wirebook | near black ink #14201A | 150 | n/a (23% saturation, 10% lightness: a neutral) |
| Straightpin | tomato #B8381C | 11 | 111 |

Postslot's neutrals are a cool grey ramp (not warm paper, not near black ink as the identity colour), the type is a single sans plus a functional mono (no condensed display), and the "warm paper + dark green + condensed display + mono" default is not used anywhere. Amber appears only as the "Held over limit" status colour, never as brand.
