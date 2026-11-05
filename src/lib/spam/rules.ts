import type { FormRules, SpamSignal } from "@/lib/forms/types";
import { isDisposableEmail } from "@/lib/security/disposable";

// Content rules engine (docs/ARCHITECTURE.md section 5). Each rule yields a named signal with a weight.
const LINK = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const SCRIPT = /<\s*(?:script|iframe|object|embed)\b|javascript:|onerror\s*=/i;

export function countLinks(text: string): number {
  return (text.match(LINK) ?? []).length;
}

export function evaluateRules(text: string, replyTo: string | undefined, rules: FormRules): SpamSignal[] {
  const out: SpamSignal[] = [];
  const links = countLinks(text);
  if (links > rules.maxLinks) out.push({ name: "links", weight: Math.min(0.9, 0.4 + 0.15 * (links - rules.maxLinks)), detail: `${links} links, limit ${rules.maxLinks}` });
  const lower = text.toLowerCase();
  const hit = rules.blockedPhrases.map((p) => p.trim().toLowerCase()).filter(Boolean).filter((p) => lower.includes(p));
  if (hit.length) out.push({ name: "blocked_phrase", weight: Math.min(0.95, 0.6 + 0.2 * (hit.length - 1)), detail: hit.slice(0, 3).join(", ") });
  if (rules.blockScripts && SCRIPT.test(text)) out.push({ name: "script_tag", weight: 0.9, detail: "markup that runs code" });
  if (rules.blockDisposable && replyTo && isDisposableEmail(replyTo)) out.push({ name: "disposable_email", weight: 0.5, detail: replyTo.split("@")[1] });
  return out;
}

/** 1 - product(1 - w), clamped to [0, 1]. */
export function combineScore(signals: { weight: number }[]): number {
  const p = signals.reduce((acc, s) => acc * (1 - Math.min(1, Math.max(0, s.weight))), 1);
  return Math.round((1 - p) * 1000) / 1000;
}
