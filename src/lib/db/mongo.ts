import { MongoClient, type Collection, type Db as MongoDatabase, type Document } from "mongodb";
import { uuidv7 } from "@/lib/ids";
import { DELIVERY_TTL_DAYS, ORG_DOC_COLLECTIONS, type AuditEntry, type BillingAccount, type Db, type DocFilter, type DocStore, type Entitlement, type Suppression, type WebhookDelivery, type WebhookEndpoint } from "./types";

// Ported from trayo server/db/mongo.ts. Changes: global singleton client (Vercel), pool 10, Date TTLs,
// stripe events recorded after success, no sync/family/anonymous. Use only from runtime = "nodejs" routes.

declare global {
  var __kitMongo: { uri: string; client: Promise<MongoClient> } | undefined;
}

export function mongoClient(uri: string): Promise<MongoClient> {
  if (globalThis.__kitMongo?.uri === uri) return globalThis.__kitMongo.client;
  const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 8000, appName: "buffersol-kit" }).connect();
  globalThis.__kitMongo = { uri, client };
  client.catch(() => {
    if (globalThis.__kitMongo?.client === client) globalThis.__kitMongo = undefined;
  });
  return client;
}

type WithId<T> = T & { _id: string };

export function createMongoDb(uri: string, dbName: string, app: string): Db {
  let dbp: Promise<MongoDatabase> | null = null;
  const db = () => (dbp ??= mongoClient(uri).then((c) => c.db(dbName)));
  const col = async <T extends Document>(name: string) => (await db()).collection<T>(name) as unknown as Collection<T>;
  const strip = <T>(d: (T & { _id?: unknown; app?: string }) | null): T | null => {
    if (!d) return null;
    const { _id: _i, ...rest } = d as Record<string, unknown>;
    return rest as T;
  };

  const toMongo = (f: DocFilter): Record<string, unknown> => {
    const out: Record<string, unknown> = { app };
    for (const [k, v] of Object.entries(f)) {
      if (v && typeof v === "object" && !(v instanceof Date) && "$text" in v) {
        // Uses the compound text index { app, orgId, searchText: "text" }: callers must also filter on orgId (equality).
        out.$text = { $search: String((v as { $text: unknown }).$text), $caseSensitive: false, $diacriticSensitive: false };
      } else if (v && typeof v === "object" && !(v instanceof Date) && "$contains" in v) {
        const { $contains, ...rest } = v as Record<string, unknown>;
        out[k] = { ...rest, $regex: String($contains).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
      } else out[k] = v;
    }
    return out;
  };
  const docs = <T extends { _id: string }>(name: string): DocStore<T> => {
    const c = () => col<Record<string, unknown>>(name);
    const clean = (d: Record<string, unknown> | null) => {
      if (!d) return null;
      const { app: _a, ...rest } = d;
      return rest as unknown as T;
    };
    return {
      async insert(doc) {
        try {
          await (await c()).insertOne({ ...doc, app } as never);
          return true;
        } catch (e) {
          if ((e as { code?: number }).code === 11000) return false;
          throw e;
        }
      },
      async get(id) {
        return clean(await (await c()).findOne({ _id: id, app } as never));
      },
      async findOne(f) {
        return clean(await (await c()).findOne(toMongo(f) as never));
      },
      async find(f, { sort, limit = 1000, skip = 0 } = {}) {
        let cur = (await c()).find(toMongo(f) as never);
        if (sort) cur = cur.sort(sort as never);
        return (await cur.skip(skip).limit(Math.min(limit, 5000)).toArray()).map((d) => clean(d)!);
      },
      async update(f, set, { inc, upsert } = {}) {
        const update: Record<string, unknown> = {};
        // undefined means "remove the field" in both drivers.
        const defined = Object.fromEntries(Object.entries(set).filter(([, v]) => v !== undefined));
        const removed = Object.fromEntries(Object.entries(set).filter(([, v]) => v === undefined).map(([k]) => [k, ""]));
        if (Object.keys(defined).length) update.$set = defined;
        if (Object.keys(removed).length) update.$unset = removed;
        if (inc && Object.keys(inc).length) update.$inc = inc;
        if (!Object.keys(update).length) return 0;
        const r = await (await c()).updateMany(toMongo(f) as never, update as never, { upsert });
        return r.matchedCount + r.upsertedCount;
      },
      async delete(f) {
        return (await (await c()).deleteMany(toMongo(f) as never)).deletedCount;
      },
      async count(f) {
        return (await c()).countDocuments(toMongo(f) as never);
      },
    };
  };

  return {
    app,
    docs,
    async getBillingAccount(id) {
      return strip<BillingAccount>(await (await col<WithId<BillingAccount>>("billing_accounts")).findOne({ _id: id, app }));
    },
    async upsertBillingAccount(a) {
      const { createdAt, ...rest } = a;
      await (await col<WithId<BillingAccount>>("billing_accounts")).updateOne(
        { _id: a.id },
        { $set: { ...rest, app }, $setOnInsert: { createdAt: createdAt ?? new Date() } },
        { upsert: true },
      );
    },
    async findBillingAccountByCustomer(c) {
      return strip<BillingAccount>(await (await col<WithId<BillingAccount>>("billing_accounts")).findOne({ app, stripeCustomerId: c }));
    },
    async getEntitlement(id) {
      const d = await (await col<WithId<Entitlement & { app: string }>>("entitlements")).findOne({ _id: id, app });
      if (!d) return null;
      const { _id: _i, app: _a, ...rest } = d;
      return rest as Entitlement;
    },
    async setEntitlement(id, e) {
      await (await col<WithId<Entitlement & { app: string }>>("entitlements")).replaceOne({ _id: id }, { ...e, app }, { upsert: true });
    },
    async hasStripeEvent(id) {
      return !!(await (await col<{ _id: string }>("stripe_events")).findOne({ _id: id }, { projection: { _id: 1 } }));
    },
    async markStripeEvent(id, type) {
      try {
        // expireAt (Date) lets Mongo TTL drop rows after Stripe's 30 day retry horizon.
        await (await col<{ _id: string; app: string; type: string; at: Date; expireAt: Date }>("stripe_events")).insertOne({
          _id: id, app, type, at: new Date(), expireAt: new Date(Date.now() + 35 * 864e5),
        });
        return true;
      } catch (e) {
        if ((e as { code?: number }).code === 11000) return false;
        throw e;
      }
    },
    async incUsage(orgId, meter, period, by = 1) {
      const r = await (await col<{ _id: string; app: string; orgId: string; meter: string; period: string; value: number }>("usage")).findOneAndUpdate(
        { _id: `${orgId}|${meter}|${period}` },
        { $inc: { value: by }, $setOnInsert: { app, orgId, meter, period } },
        { upsert: true, returnDocument: "after" },
      );
      return r?.value ?? by;
    },
    async getUsage(orgId, meter, period) {
      const d = await (await col<{ _id: string; value: number }>("usage")).findOne({ _id: `${orgId}|${meter}|${period}` });
      return d?.value ?? 0;
    },
    async hitRateLimit(key, windowMs, now = Date.now()) {
      // One atomic pipeline update: drop hits outside the window, push this one, bump the TTL Date.
      const r = await (await col<{ _id: string; hits: number[]; expireAt: Date }>("rate_limits")).findOneAndUpdate(
        { _id: `${app}:${key}` },
        [
          {
            $set: {
              hits: {
                $concatArrays: [
                  { $filter: { input: { $ifNull: ["$hits", []] }, as: "h", cond: { $gt: ["$$h", now - windowMs] } } },
                  [now],
                ],
              },
              expireAt: new Date(now + windowMs),
            },
          },
        ],
        { upsert: true, returnDocument: "after" },
      );
      return r?.hits.length ?? 1;
    },
    async appendAudit(e) {
      const entry: AuditEntry = { ...e, id: uuidv7(), app, at: e.at ?? new Date() };
      await (await col<WithId<AuditEntry>>("audit_log")).insertOne({ _id: entry.id, ...entry });
      return entry;
    },
    async listAudit(orgId, { limit = 50, before } = {}) {
      const docs = await (await col<WithId<AuditEntry>>("audit_log"))
        .find({ app, orgId, ...(before ? { at: { $lt: before } } : {}) })
        .sort({ at: -1 })
        .limit(Math.min(limit, 200))
        .toArray();
      return docs.map((d) => strip<AuditEntry>(d)!);
    },
    async createWebhookEndpoint(e) {
      const ep: WebhookEndpoint = { ...e, app, createdAt: new Date() };
      await (await col<WithId<WebhookEndpoint>>("webhook_endpoints")).insertOne({ _id: ep.id, ...ep });
      return ep;
    },
    async listWebhookEndpoints(orgId) {
      const docs = await (await col<WithId<WebhookEndpoint>>("webhook_endpoints")).find({ app, orgId }).sort({ createdAt: 1 }).toArray();
      return docs.map((d) => strip<WebhookEndpoint>(d)!);
    },
    async getWebhookEndpoint(orgId, id) {
      return strip<WebhookEndpoint>(await (await col<WithId<WebhookEndpoint>>("webhook_endpoints")).findOne({ _id: id, orgId, app }));
    },
    async updateWebhookEndpoint(orgId, id, patch) {
      await (await col<WithId<WebhookEndpoint>>("webhook_endpoints")).updateOne({ _id: id, orgId, app }, { $set: patch });
    },
    async deleteWebhookEndpoint(orgId, id) {
      await (await col<WithId<WebhookEndpoint>>("webhook_endpoints")).deleteOne({ _id: id, orgId, app });
    },
    async createDelivery(d) {
      await (await col<WithId<WebhookDelivery>>("webhook_deliveries")).insertOne({ _id: d.id, ...d, app });
    },
    async updateDelivery(id, patch) {
      await (await col<WithId<WebhookDelivery>>("webhook_deliveries")).updateOne({ _id: id, app }, { $set: patch });
    },
    async listDeliveries(orgId, { endpointId, limit = 50 } = {}) {
      const docs = await (await col<WithId<WebhookDelivery>>("webhook_deliveries"))
        .find({ app, orgId, ...(endpointId ? { endpointId } : {}) })
        .sort({ createdAt: -1 })
        .limit(Math.min(limit, 200))
        .toArray();
      return docs.map((d) => strip<WebhookDelivery>(d)!);
    },
    async getDelivery(orgId, id) {
      return strip<WebhookDelivery>(await (await col<WithId<WebhookDelivery>>("webhook_deliveries")).findOne({ _id: id, orgId, app }));
    },
    async dueDeliveries(now, limit) {
      const docs = await (await col<WithId<WebhookDelivery>>("webhook_deliveries"))
        .find({ app, status: { $in: ["pending", "retrying"] }, nextAttemptAt: { $lte: now } })
        .sort({ nextAttemptAt: 1 })
        .limit(limit)
        .toArray();
      return docs.map((d) => strip<WebhookDelivery>(d)!);
    },
    async addSuppression(s) {
      const email = s.email.toLowerCase();
      await (await col<WithId<Suppression & { app: string }>>("suppressions")).updateOne(
        { _id: `${app}:${email}|${s.scope}` },
        { $set: { email, reason: s.reason, scope: s.scope, at: s.at ?? new Date(), app } },
        { upsert: true },
      );
    },
    async isSuppressed(email, scope = "all") {
      const e = email.toLowerCase();
      return !!(await (await col<{ _id: string }>("suppressions")).findOne({ _id: { $in: [`${app}:${e}|all`, `${app}:${e}|${scope}`] } }));
    },
    async removeSuppression(email, scope = "all") {
      await (await col<{ _id: string }>("suppressions")).deleteOne({ _id: `${app}:${email.toLowerCase()}|${scope}` });
    },
    async listSuppressions({ q, limit = 100 } = {}) {
      const filter: Record<string, unknown> = { app };
      if (q) filter.email = { $regex: q.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&") };
      const rows = await (await col<WithId<Suppression & { app: string }>>("suppressions")).find(filter).sort({ at: -1 }).limit(limit).toArray();
      return rows.map(({ email, reason, scope, at }) => ({ email, reason, scope, at }));
    },
    async getConfig() {
      const docs = await (await col<{ _id: string; value: string; app: string }>("config")).find({ app }).toArray();
      return Object.fromEntries(docs.map((d) => [d._id.replace(`${app}:`, ""), d.value]));
    },
    async setConfig(k, v) {
      await (await col<{ _id: string; value: string; app: string }>("config")).updateOne({ _id: `${app}:${k}` }, { $set: { value: v, app } }, { upsert: true });
    },
    async exportOrgData(orgId) {
      const [billingAccount, entitlement, endpoints, auditLog] = await Promise.all([
        this.getBillingAccount(orgId),
        this.getEntitlement(orgId),
        this.listWebhookEndpoints(orgId),
        this.listAudit(orgId, { limit: 200 }),
      ]);
      const forms = await docs("forms").find({ orgId });
      const recipients = (await docs<{ _id: string; verifyTokenHash?: string }>("recipients").find({ orgId })).map(({ verifyTokenHash: _t, ...r }) => r);
      const submissions = await docs("submissions").find({ orgId }, { sort: { receivedAt: -1 }, limit: 5000 });
      return { billingAccount, entitlement, webhookEndpoints: endpoints.map(({ secret: _s, ...rest }) => rest), auditLog, forms, recipients, submissions };
    },
    async deleteOrgData(orgId) {
      const d = await db();
      await d.collection("billing_accounts").deleteOne({ _id: orgId as never });
      await d.collection("entitlements").deleteOne({ _id: orgId as never });
      await d.collection("usage").deleteMany({ app, orgId });
      await d.collection("webhook_endpoints").deleteMany({ app, orgId });
      await d.collection("webhook_deliveries").deleteMany({ app, orgId });
      await d.collection("audit_log").deleteMany({ app, orgId });
      await d.collection("suppressions").deleteMany({ app, scope: `org:${orgId}` });
      for (const c of ORG_DOC_COLLECTIONS) await d.collection(c).deleteMany({ app, orgId });
    },
  };
}

type IndexDb = { collection(name: string): { createIndex(keys: Record<string, unknown>, opts?: Record<string, unknown>): Promise<unknown> } };

/** Indexes. TTLs are on Date fields. Run lazily by scheduleEnsureIndexes() and manually by scripts/ensure-indexes.ts. */
export async function ensureIndexes(uri: string, dbName: string) {
  return ensureIndexesOn((await mongoClient(uri)).db(dbName) as unknown as IndexDb);
}

/** Conflicts (85 same keys other options, 86 same name other keys) are logged, never thrown: the existing index keeps working. */
export async function ensureIndexesOn(d: IndexDb) {
  const ix = async (coll: string, keys: Record<string, unknown>, opts?: Record<string, unknown>) => {
    try {
      await d.collection(coll).createIndex(keys, opts);
    } catch (e) {
      const code = (e as { code?: number }).code;
      if (code !== 85 && code !== 86) throw e;
      console.warn(`[db] index conflict on ${coll} (code ${code}), left as is`);
    }
  };
  await ix("billing_accounts", { app: 1, stripeCustomerId: 1 }, { unique: true, partialFilterExpression: { stripeCustomerId: { $type: "string" } } });
  await ix("stripe_events", { expireAt: 1 }, { expireAfterSeconds: 0 });
  await ix("rate_limits", { expireAt: 1 }, { expireAfterSeconds: 0 });
  await ix("usage", { app: 1, orgId: 1, period: 1 });
  await ix("audit_log", { app: 1, orgId: 1, at: -1 });
  await ix("webhook_endpoints", { app: 1, orgId: 1 });
  await ix("webhook_deliveries", { app: 1, orgId: 1, createdAt: -1 });
  await ix("webhook_deliveries", { app: 1, status: 1, nextAttemptAt: 1 });
  await ix("webhook_deliveries", { expireAt: 1 }, { expireAfterSeconds: 0 });
  await ix("suppressions", { app: 1, email: 1 });
  await ix("suppressions", { app: 1, scope: 1 });
  await ix("uptime_checks", { at: -1 });
  await ix("uptime_checks", { expireAt: 1 }, { expireAfterSeconds: 0 });
  // Postslot collections (docs/ARCHITECTURE.md section 2)
  await ix("forms", { key: 1 }, { unique: true });
  await ix("forms", { app: 1, orgId: 1, createdAt: -1 });
  await ix("recipients", { app: 1, orgId: 1, email: 1 }, { unique: true });
  await ix("recipients", { verifyTokenHash: 1 });
  await ix("submissions", { app: 1, formId: 1, receivedAt: -1 });
  await ix("submissions", { app: 1, orgId: 1, status: 1, receivedAt: -1 });
  await ix("submissions", { app: 1, orgId: 1, emailLower: 1 });
  await ix("submissions", { status: 1, receivedAt: 1 });
  // Retention is enforced by the `retention-purge` cron job (it writes an audit entry), not by a TTL index.
  await ix("submissions", { purgeAt: 1 });
  // Inbox search: whole-word text search. default_language "none" = no stemming, emails and names tokenise predictably.
  await ix("submissions", { app: 1, orgId: 1, searchText: "text" }, { name: "submissions_search", default_language: "none" });
  await ix("deliveries", { mailerMessageId: 1 }, { unique: true, sparse: true });
  await ix("deliveries", { submissionId: 1 });
  await ix("deliveries", { status: 1, nextAttemptAt: 1 });
  await ix("delivery_events", { submissionId: 1, at: 1 });
  await ix("delivery_events", { expireAt: 1 }, { expireAfterSeconds: 0 });
  await ix("sender_allow", { app: 1, formId: 1, email: 1 }, { unique: true });
  await ix("bayes_tokens", { app: 1, scope: 1, token: 1 }, { unique: true });
  await ix("mail_inbound_events", { expireAt: 1 }, { expireAfterSeconds: 0 });
  // Better Auth collections
  await ix("user", { email: 1 }, { unique: true });
  await ix("session", { token: 1 }, { unique: true });
  await ix("session", { expiresAt: 1 }, { expireAfterSeconds: 0 });
  await ix("verification", { identifier: 1 });
  await ix("verification", { expiresAt: 1 }, { expireAfterSeconds: 0 });
  await ix("member", { organizationId: 1, userId: 1 }, { unique: true });
  await ix("organization", { slug: 1 }, { unique: true });
  await ix("apikey", { key: 1 });
  return DELIVERY_TTL_DAYS;
}

declare global {
  var __kitIndexes: { key: string; p: Promise<void> } | undefined;
}

const scrub = (e: unknown) => String((e as Error)?.message ?? e).replace(/mongodb(\+srv)?:\/\/\S+/gi, "[uri]").slice(0, 200);

/**
 * Fire and forget, once per server instance. Never at build time, never awaited by requests, never throws.
 * On failure the memo is cleared so the next getDb() call retries. createIndex is idempotent, so concurrent instances are safe.
 */
export function scheduleEnsureIndexes(key: string, run: () => Promise<unknown>): void {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (globalThis.__kitIndexes?.key === key) return;
  const p = Promise.resolve()
    .then(run)
    .then(() => undefined)
    .catch((e) => {
      console.warn(`[db] ensureIndexes failed, will retry: ${scrub(e)}`);
      if (globalThis.__kitIndexes?.p === p) globalThis.__kitIndexes = undefined;
    });
  globalThis.__kitIndexes = { key, p };
}
