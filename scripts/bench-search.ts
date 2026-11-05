/**
 * Inbox search benchmark on the MEMORY driver: seeds 100,000 submissions and reports p50/p95/max for the inbox queries.
 *   npx tsx scripts/bench-search.ts [rows=100000] [queries=200]
 * The memory driver scans every row (with cached token sets), so this is a worst-case reference, not the production number.
 * The production number comes from Mongo with the text index `submissions_search` (npm run db:indexes): PENDING until Mongo is live,
 * see docs/PROGRESS.md. Target (docs/brief.md): p95 under 300 ms over 100k rows.
 */
import { createMemoryDb } from "../src/lib/db/memory";
import { listSubmissions } from "../src/lib/inbox/query";
import type { Submission } from "../src/lib/forms/types";

const rows = Number(process.argv[2] ?? 100_000);
const queries = Number(process.argv[3] ?? 200);
const ORG = "org_bench";

const FIRST = ["mara", "tom", "ada", "lena", "omar", "sofia", "kenji", "priya", "jonas", "nia", "luca", "iris"];
const LAST = ["okafor", "reyes", "lovelace", "novak", "haddad", "ricci", "tanaka", "patel", "berg", "mensah"];
const WORDS = ["quote", "rebrand", "website", "pricing", "support", "invoice", "launch", "march", "partnership", "booking", "refund", "demo", "logo", "redesign", "hosting", "domain", "newsletter", "careers", "press", "feedback"];

// Deterministic PRNG so runs are comparable.
let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!;

async function main() {
  const db = createMemoryDb("bench");
  const store = db.docs<Submission>("submissions");
  const t0 = Date.now();
  const now = Date.now();
  const FORMS = ["f1", "f2", "f3"];
  for (let i = 0; i < rows; i++) {
    const name = `${pick(FIRST)} ${pick(LAST)}${i % 50 === 0 ? ` ${i}` : ""}`;
    const message = Array.from({ length: 12 }, () => pick(WORDS)).join(" ");
    const email = `${name.split(" ")[0]}.${i}@visitor.test`;
    const searchText = `${name} ${email} ${message}`.toLowerCase();
    await store.insert({
      _id: String(i).padStart(8, "0"), orgId: i % 200 === 0 ? "org_other" : ORG, formId: FORMS[i % 3]!, receivedAt: new Date(now - i * 60_000),
      status: i % 9 === 0 ? "quarantined" : "delivered", fields: { name, email, message }, replyTo: email, searchText, spamScore: 0, signals: [], scored: true, isTest: false, ipHash: "x",
    });
  }
  console.log(`seeded ${rows.toLocaleString()} rows in ${((Date.now() - t0) / 1000).toFixed(1)} s`);

  const Q = [() => pick(WORDS), () => `${pick(WORDS)} ${pick(WORDS)}`, () => pick(LAST), () => `"${pick(WORDS)} ${pick(WORDS)}"`, () => `${pick(WORDS)} -${pick(WORDS)}`, () => `${pick(FIRST)}.${Math.floor(rnd() * rows)}@visitor.test`];
  const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))]!;

  // First query pays for building the token cache; report it separately.
  const c0 = performance.now();
  await listSubmissions(db, ORG, { q: "warmup", limit: 50 });
  const cold = performance.now() - c0;

  const ms: number[] = [];
  for (let i = 0; i < queries; i++) {
    const q = Q[i % Q.length]!();
    const t = performance.now();
    await listSubmissions(db, ORG, { q, filter: i % 4 === 0 ? "spam" : "all", formId: i % 5 === 0 ? "f1" : undefined, limit: 50 });
    ms.push(performance.now() - t);
  }
  console.log(`driver: memory (full scan, cached tokens) | rows: ${rows.toLocaleString()} | queries: ${queries}`);
  console.log(`first query (builds token cache): ${cold.toFixed(0)} ms`);
  console.log(`p50 ${pct(ms, 0.5).toFixed(1)} ms | p95 ${pct(ms, 0.95).toFixed(1)} ms | max ${Math.max(...ms).toFixed(1)} ms`);
  console.log("Mongo (text index submissions_search): pending, run this against Atlas once MONGODB_URI is set");

}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
