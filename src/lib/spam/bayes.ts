import type { Db } from "@/lib/db/types";
import type { SpamSignal } from "@/lib/forms/types";

// Small in-house token Bayes (docs/DECISIONS.md). Per form scope first, global as fallback.
// Trained only by owner actions ("Not spam" = ham, "Mark spam" = spam). Cold start emits no signal.
export const MIN_DOCS = 3;
const TOTALS = "__docs__";

interface TokenDoc { _id: string; orgId: string; scope: string; token: string; spam: number; ham: number }

export function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9$][a-z0-9'$-]{2,19}/g) ?? [];
  const domains = (text.toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})/g) ?? []).map((d) => `email:${d.slice(1)}`);
  return [...new Set([...words, ...domains])].slice(0, 200);
}

export interface Counts { spam: number; ham: number }

/** Graham style combination over the 15 most informative tokens, with add-one smoothing. Returns P(spam). */
export function bayesProbability(tokens: Counts[], totals: Counts): number {
  const ps = tokens.map((t) => {
    const s = (t.spam + 1) / (totals.spam + 2);
    const h = (t.ham + 1) / (totals.ham + 2);
    return s / (s + h);
  });
  const top = ps.sort((a, b) => Math.abs(b - 0.5) - Math.abs(a - 0.5)).slice(0, 15);
  const logOdds = top.reduce((acc, p) => acc + Math.log(p / (1 - p)), 0);
  return 1 / (1 + Math.exp(-logOdds));
}

const id = (scope: string, token: string) => `${scope}|${token}`;

async function load(db: Db, scope: string, tokens: string[]) {
  const store = db.docs<TokenDoc>("bayes_tokens");
  const rows = await store.find({ _id: { $in: [id(scope, TOTALS), ...tokens.map((t) => id(scope, t))] } });
  const byId = new Map(rows.map((r) => [r._id, r]));
  const totals = byId.get(id(scope, TOTALS));
  return { totals: { spam: totals?.spam ?? 0, ham: totals?.ham ?? 0 }, counts: tokens.map((t) => ({ spam: byId.get(id(scope, t))?.spam ?? 0, ham: byId.get(id(scope, t))?.ham ?? 0 })) };
}

export async function train(db: Db, orgId: string, formId: string, text: string, label: "spam" | "ham"): Promise<void> {
  const tokens = tokenize(text);
  const store = db.docs<TokenDoc>("bayes_tokens");
  for (const scope of [`form:${formId}`, "global"]) {
    for (const token of [TOTALS, ...tokens]) await store.update({ _id: id(scope, token) }, { orgId: scope === "global" ? "global" : orgId, scope, token }, { inc: { [label]: 1 }, upsert: true });
  }
}

/** Signal from the form scope when trained enough, else the global scope, else none. */
export async function bayesSignal(db: Db, formId: string, text: string): Promise<SpamSignal | null> {
  const tokens = tokenize(text);
  if (!tokens.length) return null;
  for (const scope of [`form:${formId}`, "global"]) {
    const { totals, counts } = await load(db, scope, tokens);
    if (totals.spam < MIN_DOCS || totals.ham < MIN_DOCS) continue;
    const p = bayesProbability(counts, totals);
    if (p < 0.8) return null;
    return { name: "bayes", weight: Math.min(0.85, Math.round(p * 0.85 * 1000) / 1000), detail: `p(spam)=${p.toFixed(2)} from ${scope === "global" ? "all forms" : "this form"}` };
  }
  return null;
}
