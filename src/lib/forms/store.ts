import { z } from "zod";
import { limitFor } from "@/lib/billing/entitlement";
import type { Db } from "@/lib/db/types";
import { HttpError } from "@/lib/http";
import { uuidv7 } from "@/lib/ids";
import type { MailTransport } from "@/lib/mail";
import { newFormKey } from "./keys";
import { addRecipient } from "./recipients";
import { DEFAULT_RULES, type Form, type Recipient } from "./types";

export const FormPatch = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  status: z.enum(["active", "paused"]).optional(),
  redirectUrl: z.union([z.literal(""), z.string().url().max(2048).refine((u) => /^https?:\/\//.test(u), "http(s) only")]).optional(),
  allowedOrigins: z.array(z.string().trim().min(1).max(200)).max(20).optional(),
  altchaEnabled: z.boolean().optional(),
  spamMode: z.enum(["standard", "strict", "off"]).optional(),
  spamThreshold: z.number().min(0.3).max(0.95).optional(),
  subjectTemplate: z.string().max(200).optional(),
  template: z.enum(["default", "compact", "plain"]).optional(),
  rules: z.object({
    maxLinks: z.number().int().min(0).max(50),
    blockedPhrases: z.array(z.string().trim().min(1).max(80)).max(100),
    blockScripts: z.boolean(),
    blockDisposable: z.boolean(),
  }).optional(),
});
export type FormPatchInput = z.infer<typeof FormPatch>;

export async function createForm(db: Db, ctx: { orgId: string; userEmail: string; emailVerified: boolean }, name: string, transport?: MailTransport): Promise<Form> {
  if (await db.docs<{ _id: string; suspended: boolean }>("org_flags").findOne({ _id: ctx.orgId, suspended: true })) throw new HttpError(403, "workspace_suspended");
  const now = new Date();
  const owner = await ensureRecipient(db, ctx.orgId, ctx.userEmail, { verified: ctx.emailVerified, transport });
  const form: Form = {
    _id: uuidv7(now.getTime()), orgId: ctx.orgId, name: name.trim().slice(0, 80), key: newFormKey(), status: "active",
    allowedOrigins: [], spamMode: "standard", spamThreshold: 0.7, rules: { ...DEFAULT_RULES }, altchaEnabled: false,
    subjectTemplate: "New submission on {{form}}", recipientIds: owner ? [owner._id] : [], blockedCount: 0, createdAt: now,
  };
  await db.docs<Form>("forms").insert(form);
  return form;
}

/** Plan check (recipients meter) then create. Existing addresses in the org never count twice. */
export async function ensureRecipient(db: Db, orgId: string, email: string, opts: { verified?: boolean; transport?: MailTransport } = {}): Promise<Recipient | null> {
  const store = db.docs<Recipient>("recipients");
  const existing = await store.findOne({ orgId, email: email.trim().toLowerCase() });
  if (existing) return existing;
  const ent = await db.getEntitlement(orgId);
  if ((await store.count({ orgId })) >= limitFor(ent, "recipients")) throw new HttpError(403, "plan_required", { meter: "recipients" });
  return addRecipient(db, orgId, email, opts);
}

export async function updateForm(db: Db, orgId: string, id: string, patch: FormPatchInput): Promise<Form> {
  const forms = db.docs<Form>("forms");
  const f = await forms.get(id);
  if (!f || f.orgId !== orgId) throw new HttpError(404, "not_found");
  if (f.status === "suspended") throw new HttpError(403, "form_suspended");
  const { redirectUrl, ...rest } = patch;
  await forms.update({ _id: id }, { ...rest, ...(redirectUrl !== undefined ? { redirectUrl: redirectUrl || undefined } : {}) });
  return (await forms.get(id))!;
}

export async function getOwnedForm(db: Db, orgId: string, id: string): Promise<Form> {
  const f = await db.docs<Form>("forms").get(id);
  if (!f || f.orgId !== orgId) throw new HttpError(404, "not_found");
  return f;
}
