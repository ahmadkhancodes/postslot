# Manual steps for Postslot (owner-only actions; deep link first)

1. **Atlas DB user for Postslot** (the connector asks for a confirmation no one can answer from a cloud session)
   https://cloud.mongodb.com/v2/6aeaf54cfcddba149e782d8d#/security/database/users
   Add New Database User: username `postslot-app`, autogenerate password, role `readWrite` on database `postslot`, restrict to cluster `buffersol-saas`. Paste the password to the orchestrator (or set `MONGODB_URI` in Vercel project `postslot`). The live demo needs this: on the memory driver a magic link can be verified by a different serverless instance and fails with INVALID_TOKEN.

2. **Stripe test secret key** in the cloud environment as `STRIPE_SECRET_KEY_TEST` (already on the batch list). Products and prices exist (docs/STRIPE.md).

3. **Legal placeholders** (owner must supply before launch; they render visibly on /legal/*): `{{jurisdiction}}` (governing law and venue, in `src/config/product.ts` `legal.jurisdiction`), `{{registered address}}` (BufferSol Technologies registered address, `legal.address`), `{{refund policy}}` (terms, Cancellation and refunds) and `{{cap}}` (terms, Limit of liability). A lawyer should review the legal pages before paid launch.

4. **Own mail server (M4 built the code, nothing is live).** The app can send through any SMTP server (`MAIL_PROVIDER=smtp`) and read bounces at `/api/hooks/dsn`, but no server exists yet. When one is ready: follow `docs/OWN_MTA.md` (DNS: SPF, DKIM, DMARC, PTR/rDNS, MX for the bounce domain), set the `SMTP_*` and `DSN_WEBHOOK_SECRET` env vars in Vercel, send test mail to Gmail and Outlook, and only then set the flag `own_mta_live` to `on` (admin config or `APP_FLAGS`). Until you do, site copy and the sending-domain page keep saying the feature depends on the SMTP path.
