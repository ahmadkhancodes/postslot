# Manual steps for Postslot (owner-only actions; deep link first)

1. **Atlas DB user for Postslot** (the connector asks for a confirmation no one can answer from a cloud session)
   https://cloud.mongodb.com/v2/6aeaf54cfcddba149e782d8d#/security/database/users
   Add New Database User: username `postslot-app`, autogenerate password, role `readWrite` on database `postslot`, restrict to cluster `buffersol-saas`. Paste the password to the orchestrator (or set `MONGODB_URI` in Vercel project `postslot`). The live demo needs this: on the memory driver a magic link can be verified by a different serverless instance and fails with INVALID_TOKEN.

2. **Stripe test secret key** in the cloud environment as `STRIPE_SECRET_KEY_TEST` (already on the batch list). Products and prices exist (docs/STRIPE.md).

3. **Legal placeholders** (owner must supply before launch; they render visibly on /legal/*): `{{jurisdiction}}` (governing law and venue, in `src/config/product.ts` `legal.jurisdiction`), `{{registered address}}` (BufferSol Technologies registered address, `legal.address`), `{{refund policy}}` (terms, Cancellation and refunds) and `{{cap}}` (terms, Limit of liability). A lawyer should review the legal pages before paid launch.

4. **Own mail server (M4 built the code, nothing is live).** The app can send through any SMTP server (`MAIL_PROVIDER=smtp`) and read bounces at `/api/hooks/dsn`, but no server exists yet. When one is ready: follow `docs/OWN_MTA.md` (DNS: SPF, DKIM, DMARC, PTR/rDNS, MX for the bounce domain), set the `SMTP_*` and `DSN_WEBHOOK_SECRET` env vars in Vercel, send test mail to Gmail and Outlook, and only then set the flag `own_mta_live` to `on` (admin config or `APP_FLAGS`). Until you do, site copy and the sending-domain page keep saying the feature depends on the SMTP path.

5. **Deploy the Cloudflare cron worker** (needs `CLOUDFLARE_SAAS_TOKEN` and `CLOUDFLARE_SAAS_ACCOUNT_ID`; an agent can do it once they exist, otherwise: https://dash.cloudflare.com/?to=/:account/workers-and-pages). `infra/cron-worker`: set the worker secret `CRON_SECRET` to the same value as the Vercel env `CRON_SECRET`, `APP_URL` to the production URL, then `npx wrangler deploy`. Until then delivery retries, held releases and the retention purge run once a day from `vercel.json` only (retries after a provider outage can take up to 24 h).

6. **Before paid launch** (from docs/REVIEW.md): have a person do one keyboard-only and screen reader pass of sign-in, inbox and form setup; fill or remove the `{{verify}}` cells on the compare pages after checking the competitors' own pages.

7. **Uptime probe schedule.** `/status` is fed by the `uptime-probe` job, which needs the Cloudflare cron worker (item 5, `JOBS` already lists it). Until the worker runs, `/status` only gets the daily canary from the `maintenance` cron. After deploying, run `npm run db:indexes`.
