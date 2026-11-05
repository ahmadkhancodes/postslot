# Stripe catalogue (test mode, account acct_1N578JBkP5VKCzMY)

Every object carries `metadata.app=postslot`; lookup keys are prefixed `postslot_`. Created 5 Nov 2026 via the Stripe connector (same shape `scripts/stripe-setup.ts` produces from `src/config/product.ts`).

| Product | Product id | Lookup key | Price id | Amount |
|---|---|---|---|---|
| Postslot · Starter | prod_VZRu50PACvxfK5 | postslot_starter_annual | price_1UYJ0yBkP5VKCzMYfRCEFvc5 | $24.00 / year |
| Postslot · Pro | prod_VZRuaJPaHOGdPM | postslot_pro_monthly | price_1UYJ10BkP5VKCzMYBJiKJh5m | $7.49 / month |
| Postslot · Pro | prod_VZRuaJPaHOGdPM | postslot_pro_annual | price_1UYJ13BkP5VKCzMYMT2QuHyu | $74.00 / year |
| Postslot · Agency | prod_VZRusKEITvDB3C | postslot_agency_monthly | price_1UYJ15BkP5VKCzMYolioWSln | $19.49 / month |
| Postslot · Agency | prod_VZRusKEITvDB3C | postslot_agency_annual | price_1UYJ17BkP5VKCzMYmoGdTWrO | $199.00 / year |

Webhook endpoint: `<app url>/api/stripe/webhook`, events `checkout.session.completed`, `customer.subscription.*`, `invoice.*`, `charge.refunded`, `payment_intent.succeeded`. Its `whsec_` goes in Vercel env `STRIPE_WEBHOOK_SECRET`.
Live mode: run `STRIPE_SECRET_KEY=sk_live_... npm run stripe:setup` once.
