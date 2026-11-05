import type { Db } from "@/lib/db/types";
import type { Form, Submission, SpamSignal } from "@/lib/forms/types";
import { bayesSignal } from "./bayes";
import { combineScore, evaluateRules } from "./rules";

export interface Verdict { signals: SpamSignal[]; score: number; spam: boolean; scored: boolean; allowedSender: boolean }

const BAYES_BUDGET_MS = 800;

export const thresholdFor = (form: Pick<Form, "spamMode" | "spamThreshold">) => (form.spamMode === "strict" ? Math.min(form.spamThreshold, 0.5) : form.spamThreshold);

/**
 * Content scoring: rules + Bayes on top of the edge signals already stored. Allowed senders ("Not spam" before) skip
 * content scoring but keep edge signals. Bayes failure or more than 800 ms decides on rules alone and sets scored=false.
 */
export async function scoreSubmission(db: Db, form: Form, sub: Submission): Promise<Verdict> {
  const edge = sub.signals;
  const allowed = sub.emailLower ? !!(await db.docs("sender_allow").get(`${form._id}|${sub.emailLower}`)) : false;
  if (allowed) return { signals: [...edge, { name: "allowed_sender", weight: 0, detail: "owner marked this sender not spam" }], score: combineScore(edge), spam: combineScore(edge) >= thresholdFor(form), scored: true, allowedSender: true };
  if (form.spamMode === "off") return { signals: edge, score: combineScore(edge), spam: false, scored: true, allowedSender: false };
  const content = [...evaluateRules(sub.searchText, sub.replyTo, form.rules)];
  let scored = true;
  try {
    const bayes = await Promise.race([
      bayesSignal(db, form._id, sub.searchText),
      new Promise<null>((_, rej) => setTimeout(() => rej(new Error("bayes_timeout")), BAYES_BUDGET_MS).unref?.()),
    ]);
    if (bayes) content.push(bayes);
  } catch {
    scored = false;
  }
  const signals = [...edge, ...content];
  const score = combineScore(signals);
  return { signals, score, spam: score >= thresholdFor(form), scored, allowedSender: false };
}
