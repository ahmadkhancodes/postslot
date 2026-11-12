# Design QA: Postslot M1 storefront (5 Nov 2026)

Scorecard per docs/factory/DESIGN_PLAYBOOK.md section 9. Screenshots: `docs/qa/m1/` (`/`, `/pricing`, `/compare/web3forms`, `/docs`, `/sign-in`, plus legal, 404; 375 and 1440). Graded from the built app (`npm run build && npm start`).

| Category | Score | Worst problem |
|---|---|---|
| 1. Message clarity | 5 | Hero H1 wraps to 4 lines at 1440 in the 5 column copy cell; acceptable, no orphan |
| 2. ICP fit | 5 | Differs from Web3Forms/Formspree on hero visual, palette, type, proof, signature |
| 3. Hero and product proof | 4 | Inbox is cropped to one row plus receipt at 375; sample data label sits under it |
| 4. Structure and rhythm | 4 | Bento row 2 is two equal cells (3 + 3); varied elsewhere |
| 5. Typography | 4 | Mono uses text-xs/text-sm utilities as DESIGN.md allows; no loose sizes elsewhere |
| 6. Spacing and radius | 4 | Postmark `size-24` and bar widths (inline style) are data driven |
| 7. Color and contrast | 5 | One accent (violet), flat surfaces, only the hero text gradient |
| 8. Motion and states | 4 | Postmark press and reveals only; no hover state on the static inbox rows (illustration) |
| 9. Content honesty | 4 | `{{verify}}` cells remain in the comparison on purpose; no own MTA claim; all numbers from product.ts or brief |
| 10. Responsive and ship | 5 | No horizontal overflow at 375 on any captured route |

**Total 44/50, no category under 3, no hard fail.**

## Greps (src)
- `text-[ p-[ m-[ gap-[ rounded-[`: no hits.
- Font names (Inter, Roboto, Arial...): only false positives on the word `Interval`.
- `bg-gradient|linear-gradient`: one hit, the allowed hero text gradient in globals.css.
- `ease-in-out|ease-linear|transition-all`: no hits.
- Banned words: no hits. `href="#"`: no hits. Italic or weight 900: no hits.
- Arbitrary sizes: fixed `min-w-[32rem]` to `min-w-lg`.
- Hex literals outside globals.css remain only in `icon.tsx`, `apple-icon.tsx`, `layout.tsx` theme-color and `lib/mail/templates.ts` (image and email contexts that cannot read CSS variables). Residual.

## Fixes made during QA
- Header: Sign in and Start free buttons showed on mobile (utility conflict with `inline-flex`), pushing the bar past 375. Now `max-md:hidden`.
- Compare table: `sr-only` Yes/No labels escaped the scroll container and caused 13px page overflow. The region is now `relative`.
