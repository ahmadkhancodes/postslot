/** Founder admin totals. Mongo when MONGODB_URI is set, else the in-memory auth store (stub mode). */
export async function adminOverview(): Promise<{ users: number; orgs: number; paidOrgs: number }> {
  const uri = process.env.MONGODB_URI;
  if (uri) {
    const { mongoClient } = await import("@/lib/db/mongo");
    const client = await mongoClient(uri);
    const db = client.db(process.env.MONGODB_DB ?? "postslot");
    const [users, orgs, paidOrgs] = await Promise.all([
      db.collection("user").countDocuments(),
      db.collection("organization").countDocuments(),
      db.collection("entitlements").countDocuments({ isPaid: true, app: process.env.APP_NAME ?? "postslot" }),
    ]);
    return { users, orgs, paidOrgs };
  }
  const mem = globalThis.__kitAuthMemory;
  return { users: mem?.user?.length ?? 0, orgs: mem?.organization?.length ?? 0, paidOrgs: 0 };
}

export interface OrgRecord { id: string; name: string; slug: string }

/** Better Auth organizations by id, slug or name fragment (founder admin search). Mongo when MONGODB_URI is set, else the in-memory store. */
export async function findOrganizations(q: string, limit = 20): Promise<OrgRecord[]> {
  const needle = q.trim();
  if (!needle) return [];
  const toRec = (o: Record<string, unknown>): OrgRecord => ({ id: String(o.id ?? o._id), name: String(o.name ?? ""), slug: String(o.slug ?? "") });
  const uri = process.env.MONGODB_URI;
  if (uri) {
    const { mongoClient } = await import("@/lib/db/mongo");
    const client = await mongoClient(uri);
    const rx = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const rows = await client.db(process.env.MONGODB_DB ?? "postslot").collection("organization")
      .find({ $or: [{ id: needle }, { _id: needle as never }, { slug: rx }, { name: rx }] }).limit(limit).toArray();
    return rows.map((r) => toRec(r as Record<string, unknown>));
  }
  const lower = needle.toLowerCase();
  const mem = (globalThis.__kitAuthMemory?.organization ?? []) as Record<string, unknown>[];
  return mem
    .filter((o) => String(o.id) === needle || String(o.name ?? "").toLowerCase().includes(lower) || String(o.slug ?? "").toLowerCase().includes(lower))
    .slice(0, limit).map(toRec);
}

export async function getOrganization(id: string): Promise<OrgRecord | null> {
  return (await findOrganizations(id, 1)).find((o) => o.id === id) ?? null;
}
