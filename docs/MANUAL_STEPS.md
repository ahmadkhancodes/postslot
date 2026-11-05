# Manual steps for Postslot (owner-only actions; deep link first)

1. **Make the demo public** (Vercel protection blocks visitors on `*.vercel.app`)
   https://vercel.com/ahmad-code/postslot/settings/deployment-protection
   Set "Vercel Authentication" to Disabled, then Save. Done when https://postslot.vercel.app opens in a private window without a Vercel login.

2. **Atlas DB user for Postslot** (the connector asks for a confirmation no one can answer from a cloud session)
   https://cloud.mongodb.com/v2/6aeaf54cfcddba149e782d8d#/security/database/users
   Add New Database User: username `postslot-app`, autogenerate password, role `readWrite` on database `postslot`, restrict to cluster `buffersol-saas`. Paste the password to the orchestrator (or set `MONGODB_URI` in Vercel project `postslot`).

3. **Stripe test secret key** in the cloud environment as `STRIPE_SECRET_KEY_TEST` (already on the batch list). Products and prices exist (docs/STRIPE.md).
