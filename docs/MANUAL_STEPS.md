# Manual steps for Postslot (owner-only actions; deep link first)

1. **Atlas DB user for Postslot** (the connector asks for a confirmation no one can answer from a cloud session)
   https://cloud.mongodb.com/v2/6aeaf54cfcddba149e782d8d#/security/database/users
   Add New Database User: username `postslot-app`, autogenerate password, role `readWrite` on database `postslot`, restrict to cluster `buffersol-saas`. Paste the password to the orchestrator (or set `MONGODB_URI` in Vercel project `postslot`). The live demo needs this: on the memory driver a magic link can be verified by a different serverless instance and fails with INVALID_TOKEN.

2. **Stripe test secret key** in the cloud environment as `STRIPE_SECRET_KEY_TEST` (already on the batch list). Products and prices exist (docs/STRIPE.md).
