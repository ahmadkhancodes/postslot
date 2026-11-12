# Landing page: design library compliance (12 Nov 2026)

Before/after screenshots (light, 375 and 1440, full page and fold): `before-*.png`, `after-*.png`.

## Uniqueness proof
| | Postslot |
|---|---|
| Palette | paper `#ffffff` / stone `#f6f5f1`, ink `#1a1d24`, manila `#f3ead8` / `#dccba8`, one rust accent `#b3431b` |
| Fonts | Newsreader 500 (display), Schibsted Grotesk 400/500/600 (body), JetBrains Mono 400/500 (data) |
| Radius feel | sharp: 2px controls, 4px panels, nothing larger |
| Layout | A, classic hero plus sections: a split hero with the inbox and its receipt explains the product at a glance, then ruled spec sheet sections |
| Hero | 5/7 split: flat ink serif claim, one CTA, ruled fact list and dated price proof on the left; the inbox ledger with a manila receipt laid over it on the right |
| Signature | rust postmark stamp on manila receipts, with dashed tear lines and mono timestamps |

How it differs: it's the only warm paper and rubber stamp page. Wirebook is a green ledger, DockCrate steel stencil, Hotrail a navy rail, Stepclimb a blueprint, Inboxwire white API docs and Straightpin newsprint.

## Lighthouse mobile (lighthouse@12, local `next start`, 3 runs)
| Page | Before | After (runs) | Median |
|---|---|---|---|
| `/` | 70 (TBT 1190 ms, LCP 3.0 s) | 94, 96, 88 | 94 |
| `/pricing` | 92 | 93, 98, 98 | 98 |

The home LCP swings between 2.2 and 3.2 s with identical request sets. It depends on whether hydration script evaluation lands before the hero paint, so home does not reliably clear 95 yet.

## Checks
`tests/unit/landing-design.test.ts` covers the type scale in globals.css, postmark sizes, the 680px hero cap, the h1 line-break space, no hyphens in rendered copy, and reduced motion for the tagline. `tests/e2e/landing-design.spec.ts` covers type scale and overflow at 1440/390, a per-word tagline reveal in reading order, reduced motion, and the mobile menu stagger.
