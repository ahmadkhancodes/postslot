# Design brief: Postslot by BufferSol (redesign, 12 Nov 2026)

Supersedes the visual sections of `docs/DESIGN.md` (sections 5 to 7: violet accent, Geist everywhere). Light mode only (D-L1). Written before any UI code, per `docs/factory/DESIGN_PLAYBOOK.md`. Conflict order: owner prompt (this redesign task) > this file > the landing-page skill > framework defaults.

Why: the founder judged the previous UI "typical AI-generated" look. The audit below shows why: Geist on everything, a violet accent, the same 8 to 16px radius on every card, a four-number stat strip, identical feature cards, gradient hero text, and an app that was a stack of rounded cards.

## 1. Competitor and taste audit (real screenshots)

Captured with Playwright (Chromium) on 12 Nov 2026 at 1440x900 and 375x812, above the fold: `docs/qa/design/audit/<site>-<width>.jpg`.

| Site | What the first screen does | Palette and type | Takeaway |
|---|---|---|---|
| Web3Forms (leader) | Centred H1 "Contact Forms for Modern Websites", centred pink-to-coral gradient button, dark code block, 4-number stat strip (412,000+, 13.2 million+, 99.9%, 220,000+), chat bubble | Navy page, indigo button, pink gradient CTA, geometric sans, handwritten "How it works" | The template look we must avoid; also the thing our ICP is leaving |
| Formspree | Left H1 "The production-ready form backend", isometric 3D dark form card with "Contact ACME Co", red CTA, `fetch` command chip | Black page, crimson #DF102C, red glow at the top, Degular + Geist | Premium but dark, glow, fake 3D object, placeholder "ACME" |
| Basin | Centred H1 "Point any form at Basin. Or build one here.", Google + email buttons as pills, avatar row; cookie wall covers half the screen | Mint tint page, green pill buttons, navy H1, system sans | Friendly SMB, pill everything |
| Static Forms | Left H1 with red half, eyebrow dot label, floating isometric cards with a red 3D cube, "Illustrative demo" tag | Warm off-white paper, red #C8323C, tight grotesk + mono labels | Closest to an "editorial" look; warm paper + red is now taken |
| Resend (adjacent, ICP loves it) | Left serif H1 "Email for developers", dark 3D cube, two buttons | Black, white serif display, grey sans | Proves a serif display reads "crafted" to developers |
| Linear (adjacent) | Left H1, then the real product UI full width under it | Near-black, restrained, product UI is the hero image | Real UI as the hero, dense lists, small type, hairlines |
| Stripe (adjacent) | Left H1 with a live number, ribbon artwork, logo strip | White, blurple, ribbon gradient | Specific live number beats adjectives |

**What they all do:** (1) the hero sells "form to inbox" with a code block or a fake 3D form, never one real submission; (2) proof is volume numbers or logo walls; (3) either dark with a coloured glow (Web3Forms, Formspree, Resend) or a tinted page with one saturated button (Basin, Static Forms); (4) pill buttons or big radius; (5) red and indigo/blue are the category accents; mint is Basin's.

**Direction chosen: "the sorting office ledger".** A light, printed, paper-and-ink look built on the thing only Postslot has: the delivery receipt. Things look like postal stationery and ledgers (ruled rows, tear lines, a cancellation stamp, ink and franking colour), set in an editorial serif with a precise grotesk and a mono for every machine value. It is recognisable to developers (Resend's serif, Linear's dense real UI) without copying either: it is light, not dark; ruled, not carded; rust and manila, not red or indigo.

## 2. ICP card

- **Who:** Jake, freelance web developer (Austin) or the lead developer at a 2 to 25 person agency (Leeds), 5 to 200 client sites on Astro, Next.js, Webflow, Framer; secondary Maya, a non technical founder on Lovable/Bolt.
- **Job:** prove to a client that the contact form worked; keep spam out; never lose a lead at the quota.
- **Buys:** $24 to $199 a year on a card, in one sitting, after reading docs and pricing.
- **Tastes:** Vercel, Linear, Resend, Stripe docs; an editor and a terminal; dense tables over cards; exact timestamps; plain words.
- **Fears:** "we got no leads" with no evidence; spam floods; surprise bills; a service that silently drops mail.
- **Reading context:** desktop, docs open beside the editor; phone for "is it working?" checks from a client meeting.

## 3. Positioning line

**The form endpoint that hands you a receipt for every submission.** For freelance developers and small agencies: point any HTML form at Postslot, spam stays out of your count, over-limit mail is held not dropped, and each message carries a stamped record of where it went. Half the price of Web3Forms Pro.

## 4. Visual system (new)

### Palette (role tokens in `src/app/globals.css`, nothing else references raw hex)

| Role | Value | Notes |
|---|---|---|
| Ink (text, primary buttons, app sidebar) | `#1A1D24` blue-black | Postmark/fountain-pen ink. Primary buttons are ink, not colour |
| Paper (page) | `#FFFFFF` | Clean white; the warmth comes from objects, not the page |
| Paper raised | `#F6F5F1` | Neutral stone, for app canvas and table heads |
| Manila (receipt surface) | `#F3EAD8` with border `#DCCBA8` | Only on receipt/envelope objects and the highlighted plan |
| Rust (the one accent) | `#B3431B`, hover `#963714` | Franking ink. Links, the stamp, active nav marker, focus. 5.6:1 on white |
| Rule | `#E4E2DC`, strong `#8B8A85` | Hairlines and inputs (strong is 3.4:1 for input borders) |
| Text subtle / muted | `#4F525A` / `#63666E` | Both AA on white and on paper raised |
| Semantic | success `#1E6B3A`, warning `#7A5200`, danger `#A8261C` with pale surfaces | State only, always with a word |

Different from every competitor on two axes or more: light page (vs Web3Forms/Formspree dark), ink buttons with a rust accent (vs indigo, crimson, mint), ruled ledger layout (vs cards and 3D objects). Not purple, not indigo, not default blue, not green/teal.

### Type (`next/font/google`, `src/app/fonts.ts`)

- **Display: Newsreader** (500, 600; optical sizes). Editorial serif for H1 to H4 and big numbers in pricing. No italics.
- **Text: Schibsted Grotesk** (400, 500, 600). Newspaper grotesk with character; all UI and body.
- **Mono: JetBrains Mono** (400, 500). Form keys, endpoints, timestamps, receipt events, counts in tables (`tabular-nums`).
- Named styles stay (`heading-*`, `title-*`, `body-*`, `button-*`, `caption-*`); headings switch to the serif. One new style: `label-mono` (12px mono, uppercase, 0.06em tracking) for ledger column heads and section numbers. No gradient hero text: the H1 is solid ink.

### Grid, radius, borders

- 12 column grid, container `max-w-7xl`, hero splits 5/7 (copy left, product right), sections alternate between full-bleed ledger rows, a 4/8 split and a two column spec sheet. No section uses the same layout as the one before it.
- **Radius personality: sharp.** Controls and chips `rounded-sm` (2px), panels and product frames `rounded` (4px). Nothing above 4px except the round postmark. No pills.
- Borders all the way round or a 1px rule element between rows. Ledger rows use rule dividers, not cards. Receipts get a dashed "tear line" rule.
- Shadows: none, except one 1px offset ink shadow (`shadow-[...]` is banned, so a token `--shadow-stamp`) on the hero product frame and dialogs.

### Imagery

Only real product components with realistic, fictional-but-plausible data (Harbor Studio, Okafor Dental, Reyes Bakery), labelled "Example data". No stock art, no emoji, no 3D, no illustrations. Phosphor icons, regular weight, used sparingly (nav, buttons), never in a tinted rounded square.

### Motion

The postmark press (500ms, once) and receipt rows ticking in on first view (staggered 80ms, opacity + 8px rise). Hover: colour 300ms. `prefers-reduced-motion`: opacity only. Curve `cubic-bezier(0.22,1,0.36,1)`.

### App

- Ink sidebar (dark nav on a light app, a rust 2px marker shows the current page via a separate element), paper-raised canvas, white work surfaces.
- Inbox is a ledger table: sender, message preview, form, status word, time in mono; 44px rows minimum; sticky head; detail panel as a receipt.
- Status chips: square 2px, text plus a 6px dot, never colour alone.
- One primary (ink) button per screen; secondary is outlined; tertiary is a rust text link.
- Empty states: a short sentence, the next action, and an example of what will appear (a faint receipt).
- Focus: 2px rust outline, 2px offset, everywhere.

## 5. Banned-tell checklist (checked on every page)

Centred hero over glow: no. Purple/indigo: no. One sans everywhere: no (serif + grotesk + mono). Three identical icon cards: removed. "Everything you need" grids: none. Emoji or stock art: none. Glassmorphism: none (header is solid white with a rule). Same 12 to 16px radius: replaced by 2/4px. Pill badges: none. Uniform section rhythm: alternating layouts and paddings (96/64/48). Invented stat strips: the four-number strip is replaced by an honest spec line inside the hero. Vague copy: grep for streamline/seamless/supercharge/effortless/unlock stays empty.

## 6. QA

Screenshots `docs/qa/design/*.png` (1440 and 375, light), produced by `scripts/design-shots.ts`. Scores and iteration notes in `docs/design-qa.md`.
