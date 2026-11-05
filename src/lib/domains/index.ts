import { resolveCname, resolveTxt } from "node:dns/promises";
import { product } from "@/config/product";
import type { Db } from "@/lib/db/types";
import { HttpError } from "@/lib/http";

// Custom sending domain: the DNS records a customer adds, and a check that looks them up (docs/OWN_MTA.md).
// Depends on the SMTP path: nothing sends from a customer domain until the own mail server is live.

export interface Resolver {
  resolveTxt(name: string): Promise<string[][]>;
  resolveCname(name: string): Promise<string[]>;
}
export const systemResolver: Resolver = { resolveTxt, resolveCname };

export interface SenderDomain {
  _id: string;
  orgId: string;
  domain: string;
  createdAt: Date;
  checkedAt?: Date;
  results?: RecordCheck[];
  verified?: boolean;
}

export interface ExpectedRecord {
  id: "spf" | "dkim" | "dmarc";
  label: string;
  type: "TXT" | "CNAME";
  host: string;
  value: string;
  purpose: string;
}

export interface RecordCheck {
  id: ExpectedRecord["id"];
  host: string;
  type: ExpectedRecord["type"];
  expected: string;
  status: "pass" | "fail";
  found: string[];
  detail: string;
}

const HOSTNAME = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export function normalizeDomain(input: string): string {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (!HOSTNAME.test(d)) throw new HttpError(400, "invalid_domain");
  return d;
}

export function expectedRecords(domain: string): ExpectedRecord[] {
  const s = product.sending;
  return [
    { id: "spf", label: "SPF", type: "TXT", host: domain, value: `v=spf1 include:${s.spfInclude} ~all`, purpose: "Lists the servers allowed to send for your domain. Merge the include into an SPF record you already have: a domain may have only one." },
    { id: "dkim", label: "DKIM", type: "CNAME", host: `${s.dkimSelector}._domainkey.${domain}`, value: s.dkimTarget, purpose: "Lets receivers check each message was signed by us for your domain. We rotate the key behind the CNAME, so you do not have to." },
    { id: "dmarc", label: "DMARC", type: "TXT", host: `_dmarc.${domain}`, value: `v=DMARC1; p=none; rua=mailto:${s.dmarcReportAddress}`, purpose: "Tells receivers what to do when SPF and DKIM fail. Start at p=none, move to quarantine once reports look clean." },
  ];
}

const missing = (e: unknown) => ["ENOTFOUND", "ENODATA", "NXDOMAIN"].includes((e as { code?: string })?.code ?? "");
const flat = (rows: string[][]) => rows.map((r) => r.join(""));

async function txt(r: Resolver, name: string): Promise<{ values: string[]; error?: string }> {
  try { return { values: flat(await r.resolveTxt(name)) }; }
  catch (e) { return missing(e) ? { values: [] } : { values: [], error: "The DNS lookup failed. Try again in a minute." }; }
}

/** Looks up each record and reports pass or fail. Never throws; a failed lookup is a failed check with a reason. */
export async function checkRecords(domain: string, resolver: Resolver = systemResolver): Promise<RecordCheck[]> {
  const exp = expectedRecords(domain);
  const out: RecordCheck[] = [];
  for (const e of exp) {
    const base = { id: e.id, host: e.host, type: e.type, expected: e.value } as const;
    if (e.id === "spf") {
      const { values, error } = await txt(resolver, e.host);
      const spf = values.filter((v) => /^v=spf1(\s|$)/i.test(v));
      const include = `include:${product.sending.spfInclude}`.toLowerCase();
      if (error) out.push({ ...base, status: "fail", found: spf, detail: error });
      else if (!spf.length) out.push({ ...base, status: "fail", found: [], detail: "No SPF record found at the domain." });
      else if (spf.length > 1) out.push({ ...base, status: "fail", found: spf, detail: "More than one SPF record. Receivers reject this: merge them into one." });
      else if (!spf[0]!.toLowerCase().split(/\s+/).includes(include)) out.push({ ...base, status: "fail", found: spf, detail: `The SPF record does not include ${product.sending.spfInclude}.` });
      else out.push({ ...base, status: "pass", found: spf, detail: "SPF includes our sending servers." });
    } else if (e.id === "dkim") {
      let found: string[] = [];
      try { found = (await resolver.resolveCname(e.host)).map((x) => x.replace(/\.$/, "").toLowerCase()); }
      catch (err) { if (!missing(err)) { out.push({ ...base, status: "fail", found: [], detail: "The DNS lookup failed. Try again in a minute." }); continue; } }
      if (!found.length) out.push({ ...base, status: "fail", found, detail: "No CNAME found at the DKIM host." });
      else if (!found.includes(e.value.toLowerCase())) out.push({ ...base, status: "fail", found, detail: `The CNAME points to ${found[0]}, not ${e.value}.` });
      else out.push({ ...base, status: "pass", found, detail: "The DKIM CNAME points at our key." });
    } else {
      const { values, error } = await txt(resolver, e.host);
      const dmarc = values.filter((v) => /^v=DMARC1\b/i.test(v));
      if (error) out.push({ ...base, status: "fail", found: dmarc, detail: error });
      else if (!dmarc.length) out.push({ ...base, status: "fail", found: [], detail: "No DMARC record found at _dmarc." });
      else if (!/;\s*p=(none|quarantine|reject)\b/i.test(dmarc[0]!.replace(/^v=DMARC1\s*/i, "; "))) out.push({ ...base, status: "fail", found: dmarc, detail: "The DMARC record has no valid p= policy." });
      else out.push({ ...base, status: "pass", found: dmarc, detail: "A DMARC policy is published." });
    }
  }
  return out;
}

export const allPass = (r: RecordCheck[]) => r.length > 0 && r.every((x) => x.status === "pass");

export const MAX_DOMAINS = 5;

export async function addDomain(db: Db, orgId: string, input: string, now = new Date()): Promise<SenderDomain> {
  const domain = normalizeDomain(input);
  const store = db.docs<SenderDomain>("sender_domains");
  if ((await store.count({ orgId })) >= MAX_DOMAINS) throw new HttpError(403, "domain_limit");
  const doc: SenderDomain = { _id: `${orgId}|${domain}`, orgId, domain, createdAt: now };
  if (!(await store.insert(doc))) throw new HttpError(409, "domain_exists");
  return doc;
}

export async function runCheck(db: Db, orgId: string, domain: string, resolver: Resolver = systemResolver, now = new Date()): Promise<SenderDomain> {
  const store = db.docs<SenderDomain>("sender_domains");
  const d = await store.get(`${orgId}|${domain}`);
  if (!d) throw new HttpError(404, "not_found");
  const results = await checkRecords(d.domain, resolver);
  await store.update({ _id: d._id }, { results, checkedAt: now, verified: allPass(results) });
  return (await store.get(d._id))!;
}
