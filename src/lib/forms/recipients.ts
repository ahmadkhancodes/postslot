import { log } from "@/lib/logger";
import { appUrl } from "@/lib/env";
import { randomToken, sha256 } from "@/lib/ids";
import { sendMail, transportFromEnv, type MailTransport } from "@/lib/mail";
import { renderVerification } from "@/lib/delivery/templates";
import { dispatchHeldUnverified, type Deps } from "@/lib/delivery/dispatch";
import { normEmail } from "@/lib/security/disposable";
import type { Db } from "@/lib/db/types";
import type { Form, Recipient, Submission } from "./types";

export const VERIFY_RESEND_MS = 60_000;
export const VERIFY_TTL_MS = 7 * 864e5;
export const recipientId = (orgId: string, email: string) => `${orgId}|${email.toLowerCase()}`;

/** Emails a confirmation link. Throttled to one per minute per address. Content is never sent before this is confirmed. */
export async function sendVerification(db: Db, r: Recipient, transport: MailTransport = transportFromEnv(), now = new Date()): Promise<boolean> {
  if (r.verifiedAt) return false;
  if (r.verifySentAt && now.getTime() - r.verifySentAt.getTime() < VERIFY_RESEND_MS) return false;
  const token = randomToken(24);
  await db.docs<Recipient>("recipients").update({ _id: r._id }, { verifyTokenHash: await sha256(token), verifySentAt: now });
  const mail = renderVerification(r.email, `${appUrl()}/verify-recipient?t=${token}`);
  try {
    await sendMail({ to: r.email, ...mail, category: "transactional" }, transport);
  } catch (e) {
    // Provider rejected (bad address, rate limit): never 500 and never leak its message. Free the throttle so the owner can retry.
    log.warn("verification_mail_failed", { message: (e as Error).message.slice(0, 120) });
    await db.docs<Recipient>("recipients").update({ _id: r._id }, { verifySentAt: undefined });
    return false;
  }
  return true;
}

/** Creates the recipient (or returns the existing one). `verified` is for the signed-in member's own address. */
export async function addRecipient(db: Db, orgId: string, rawEmail: string, opts: { verified?: boolean; transport?: MailTransport; now?: Date } = {}): Promise<Recipient | null> {
  const email = normEmail(rawEmail);
  if (!email) return null;
  const now = opts.now ?? new Date();
  const store = db.docs<Recipient>("recipients");
  const doc: Recipient = { _id: recipientId(orgId, email), orgId, email, source: opts.verified ? "login" : "manual", ...(opts.verified ? { verifiedAt: now } : {}) };
  if (await store.insert(doc)) {
    if (!opts.verified) await sendVerification(db, doc, opts.transport, now);
    return (await store.get(doc._id))!;
  }
  return store.get(doc._id);
}

/** Confirms a token, then dispatches submissions that were held waiting for this address. */
export async function verifyRecipient(db: Db, token: string, deps: Deps = {}, now = new Date()): Promise<{ email: string; released: number } | null> {
  if (!token || token.length > 200) return null;
  const store = db.docs<Recipient>("recipients");
  const r = await store.findOne({ verifyTokenHash: await sha256(token) });
  if (!r || !r.verifySentAt || now.getTime() - r.verifySentAt.getTime() > VERIFY_TTL_MS) return null;
  await store.update({ _id: r._id }, { verifiedAt: r.verifiedAt ?? now, verifyTokenHash: undefined });
  const forms = await db.docs<Form>("forms").find({ orgId: r.orgId, recipientIds: r._id });
  let released = 0;
  for (const f of forms) {
    const held = await db.docs<Submission>("submissions").find({ formId: f._id, status: "held", holdReason: "recipient_unverified" }, { sort: { receivedAt: 1 }, limit: 500 });
    for (const s of held) {
      if (await dispatchHeldUnverified(db, f, s, deps)) released++;
    }
  }
  return { email: r.email, released };
}
