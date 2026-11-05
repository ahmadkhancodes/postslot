import { uuidv7 } from "@/lib/ids";
import { matchText, parseTextQuery } from "./text";
import { ORG_DOC_COLLECTIONS, type AuditEntry, type BillingAccount, type Db, type DocFilter, type DocStore, type Entitlement, type Suppression, type WebhookDelivery, type WebhookEndpoint } from "./types";

const cmpVal = (v: unknown) => (v instanceof Date ? v.getTime() : v);

/** Filter matcher mirroring the Mongo subset in DocFilter. */
export function matchDoc(doc: Record<string, unknown>, filter: DocFilter): boolean {
  return Object.entries(filter).every(([k, cond]) => {
    const v = doc[k];
    if (cond && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond) && Object.keys(cond).some((x) => x.startsWith("$"))) {
      return Object.entries(cond as Record<string, unknown>).every(([op, arg]) => {
        const a = cmpVal(v) as never;
        const b = cmpVal(arg) as never;
        switch (op) {
          case "$in": return (arg as unknown[]).some((x) => cmpVal(x) === a || (Array.isArray(v) && v.includes(x)));
          case "$ne": return a !== b;
          case "$lt": return v != null && a < b;
          case "$lte": return v != null && a <= b;
          case "$gt": return v != null && a > b;
          case "$gte": return v != null && a >= b;
          case "$exists": return (v !== undefined) === Boolean(arg);
          case "$contains": return typeof v === "string" && v.toLowerCase().includes(String(arg).toLowerCase());
          case "$text": return matchText(doc, v, parseTextQuery(String(arg)));
          default: throw new Error(`unsupported_filter_${op}`);
        }
      });
    }
    if (Array.isArray(v) && !Array.isArray(cond)) return v.includes(cond);
    return cmpVal(v) === cmpVal(cond);
  });
}

function memoryStore<T extends { _id: string }>(rows: Map<string, T>): DocStore<T> {
  const clone = <X>(x: X): X => structuredClone(x);
  const all = (f: DocFilter) => [...rows.values()].filter((d) => matchDoc(d as Record<string, unknown>, f));
  return {
    async insert(doc) {
      if (rows.has(doc._id)) return false;
      rows.set(doc._id, clone(doc));
      return true;
    },
    async get(id) {
      const d = rows.get(id);
      return d ? clone(d) : null;
    },
    async findOne(f) {
      const d = all(f)[0];
      return d ? clone(d) : null;
    },
    async find(f, { sort, limit = 1000, skip = 0 } = {}) {
      let r = all(f);
      if (sort) {
        const keys = Object.entries(sort);
        r = r.sort((x, y) => {
          for (const [k, dir] of keys) {
            const a = cmpVal((x as Record<string, unknown>)[k]) as never;
            const b = cmpVal((y as Record<string, unknown>)[k]) as never;
            if (a === b) continue;
            if (a === undefined) return 1;
            if (b === undefined) return -1;
            return (a < b ? -1 : 1) * dir;
          }
          return 0;
        });
      }
      return r.slice(skip, skip + limit).map(clone);
    },
    async update(f, set, { inc, upsert } = {}) {
      let hit = all(f);
      if (!hit.length && upsert && typeof f._id === "string") {
        const fresh = { _id: f._id } as T;
        rows.set(f._id, fresh);
        hit = [fresh];
      }
      for (const d of hit) {
        for (const [k, v] of Object.entries(set)) {
          if (v === undefined) delete (d as Record<string, unknown>)[k];
          else (d as Record<string, unknown>)[k] = clone(v);
        }
        for (const [k, by] of Object.entries(inc ?? {})) { const r = d as unknown as Record<string, number>; r[k] = (r[k] ?? 0) + by; }
      }
      return hit.length;
    },
    async delete(f) {
      const hit = all(f);
      for (const d of hit) rows.delete(d._id);
      return hit.length;
    },
    async count(f) {
      return all(f).length;
    },
  };
}

/** In-memory Db for tests, local dev and stub mode. Same semantics as the Mongo driver (dbContract.ts). */
export function createMemoryDb(app: string, config: Record<string, string> = {}): Db {
  const accounts = new Map<string, BillingAccount>();
  const ents = new Map<string, Entitlement>();
  const events = new Set<string>();
  const usage = new Map<string, number>();
  const limits = new Map<string, number[]>();
  const audit: AuditEntry[] = [];
  const endpoints = new Map<string, WebhookEndpoint>();
  const deliveries = new Map<string, WebhookDelivery>();
  const suppressions = new Map<string, Suppression>();
  const cfg = new Map(Object.entries(config));
  const stores = new Map<string, Map<string, { _id: string }>>();
  const clone = <T>(x: T): T => structuredClone(x);
  const sKey = (email: string, scope = "all") => `${email.toLowerCase()}|${scope}`;

  return {
    app,
    docs<T extends { _id: string }>(name: string) {
      let m = stores.get(name);
      if (!m) stores.set(name, (m = new Map()));
      return memoryStore<T>(m as unknown as Map<string, T>);
    },
    async getBillingAccount(id) {
      const a = accounts.get(id);
      return a ? clone(a) : null;
    },
    async upsertBillingAccount(a) {
      const prev = accounts.get(a.id);
      accounts.set(a.id, { ...prev, ...a, app, createdAt: prev?.createdAt ?? a.createdAt ?? new Date() });
    },
    async findBillingAccountByCustomer(c) {
      const a = [...accounts.values()].find((x) => x.stripeCustomerId === c);
      return a ? clone(a) : null;
    },
    async getEntitlement(id) {
      const e = ents.get(id);
      return e ? clone(e) : null;
    },
    async setEntitlement(id, e) {
      ents.set(id, clone(e));
    },
    async hasStripeEvent(id) {
      return events.has(id);
    },
    async markStripeEvent(id) {
      if (events.has(id)) return false;
      events.add(id);
      return true;
    },
    async incUsage(orgId, meter, period, by = 1) {
      const k = `${orgId}|${meter}|${period}`;
      const v = (usage.get(k) ?? 0) + by;
      usage.set(k, v);
      return v;
    },
    async getUsage(orgId, meter, period) {
      return usage.get(`${orgId}|${meter}|${period}`) ?? 0;
    },
    async hitRateLimit(key, windowMs, now = Date.now()) {
      const hits = (limits.get(key) ?? []).filter((t) => t > now - windowMs);
      hits.push(now);
      limits.set(key, hits);
      return hits.length;
    },
    async appendAudit(e) {
      const entry: AuditEntry = { ...e, id: uuidv7(), app, at: e.at ?? new Date() };
      audit.push(Object.freeze(clone(entry)));
      return clone(entry);
    },
    async listAudit(orgId, { limit = 50, before } = {}) {
      return audit
        .filter((a) => a.orgId === orgId && (!before || a.at < before))
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .slice(0, limit)
        .map(clone);
    },
    async createWebhookEndpoint(e) {
      const ep: WebhookEndpoint = { ...e, app, createdAt: new Date() };
      endpoints.set(ep.id, ep);
      return clone(ep);
    },
    async listWebhookEndpoints(orgId) {
      return [...endpoints.values()].filter((e) => e.orgId === orgId).map(clone);
    },
    async getWebhookEndpoint(orgId, id) {
      const e = endpoints.get(id);
      return e && e.orgId === orgId ? clone(e) : null;
    },
    async updateWebhookEndpoint(orgId, id, patch) {
      const e = endpoints.get(id);
      if (e && e.orgId === orgId) endpoints.set(id, { ...e, ...patch });
    },
    async deleteWebhookEndpoint(orgId, id) {
      const e = endpoints.get(id);
      if (e && e.orgId === orgId) endpoints.delete(id);
    },
    async createDelivery(d) {
      deliveries.set(d.id, { ...clone(d), app });
    },
    async updateDelivery(id, patch) {
      const d = deliveries.get(id);
      if (d) deliveries.set(id, { ...d, ...clone(patch) });
    },
    async listDeliveries(orgId, { endpointId, limit = 50 } = {}) {
      return [...deliveries.values()]
        .filter((d) => d.orgId === orgId && (!endpointId || d.endpointId === endpointId))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
        .map(clone);
    },
    async getDelivery(orgId, id) {
      const d = deliveries.get(id);
      return d && d.orgId === orgId ? clone(d) : null;
    },
    async dueDeliveries(now, limit) {
      return [...deliveries.values()]
        .filter((d) => (d.status === "pending" || d.status === "retrying") && d.nextAttemptAt && d.nextAttemptAt <= now)
        .sort((a, b) => a.nextAttemptAt!.getTime() - b.nextAttemptAt!.getTime())
        .slice(0, limit)
        .map(clone);
    },
    async addSuppression(s) {
      suppressions.set(sKey(s.email, s.scope), { ...s, email: s.email.toLowerCase(), at: s.at ?? new Date() });
    },
    async isSuppressed(email, scope = "all") {
      return suppressions.has(sKey(email, "all")) || suppressions.has(sKey(email, scope));
    },
    async removeSuppression(email, scope = "all") {
      suppressions.delete(sKey(email, scope));
    },
    async getConfig() {
      return Object.fromEntries(cfg);
    },
    async setConfig(k, v) {
      cfg.set(k, v);
    },
    async exportOrgData(orgId) {
      return {
        billingAccount: accounts.get(orgId) ?? null,
        entitlement: ents.get(orgId) ?? null,
        webhookEndpoints: [...endpoints.values()].filter((e) => e.orgId === orgId).map(({ secret: _s, ...rest }) => rest),
        auditLog: audit.filter((a) => a.orgId === orgId),
        forms: await this.docs("forms").find({ orgId }),
        recipients: (await this.docs<{ _id: string; verifyTokenHash?: string }>("recipients").find({ orgId })).map(({ verifyTokenHash: _t, ...r }) => r),
        submissions: await this.docs("submissions").find({ orgId }, { sort: { receivedAt: -1 }, limit: 5000 }),
      };
    },
    async deleteOrgData(orgId) {
      accounts.delete(orgId);
      ents.delete(orgId);
      for (const [k] of usage) if (k.startsWith(`${orgId}|`)) usage.delete(k);
      for (const [k, e] of endpoints) if (e.orgId === orgId) endpoints.delete(k);
      for (const [k, d] of deliveries) if (d.orgId === orgId) deliveries.delete(k);
      for (const c of ORG_DOC_COLLECTIONS) await this.docs(c).delete({ orgId });
      // The audit log is append-only: entries are kept (no PII beyond ids) per the privacy policy.
    },
  };
}
