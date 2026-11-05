import { z } from "zod";
import { planById, type MeterId, type PlanId } from "@/config/product";
import { findOrganizations, getOrganization, type OrgRecord } from "@/lib/admin";
import { adminEmails, env } from "@/lib/env";
import { NONE, lifetimeEntitlement } from "@/lib/billing/entitlement";
import { periodOf } from "@/lib/billing/usage";
import type { Db, Entitlement } from "@/lib/db/types";
import type { Delivery, Form, Submission } from "@/lib/forms/types";
import { HttpError } from "@/lib/http";
import { transportFromEnv } from "@/lib/mail";

// Founder admin (docs/ARCHITECTURE.md section 12). Only emails in ADMIN_EMAILS get in. Every write appends an audit entry.

export interface Actor { id: string; email: string }

/** Throws 404 (not 403) so the page does not reveal that /admin exists. */
export function assertFounder(email: string | null | undefined): void {
  if (!email || !adminEmails().includes(email.toLowerCase())) throw new HttpError(404, "not_found");
}

export interface OrgFlag { _id: string; suspended: boolean; reason?: string; at: Date; by: string }

export const orgSuspended = async (db: Db, orgId: string): Promise<boolean> => !!(await db.docs<OrgFlag>("org_flags").get(orgId))?.suspended;

// ---------------------------------------------------------------- abuse signals

export interface AbuseStats {
  /** This month: legitimate (counted + held) and spam. */
  legit: number;
  spam: number;
  /** Last 30 days. */
  deliveries: number;
  returned: number;
  complaints: number;
  /** Field names that look like credentials or card data, seen in recent submissions. */
  sensitiveFields: string[];
}

export interface AbuseSignal { id: "spam_ratio" | "bounce_rate" | "complaint_rate" | "sensitive_fields"; label: string; detail: string; severity: "warn" | "high" }

export const ABUSE = { spamRatio: 0.9, spamMinVolume: 20, bounceRate: 0.04, complaintRate: 0.0008, minDeliveries: 50 } as const;
export const SENSITIVE_FIELD = /pass(word|wd)?|card(_?number|num)?|cvv|cvc|ssn|social_?security|iban|secret|pin_?code/i;

const pct = (x: number) => `${(x * 100).toFixed(x < 0.01 ? 2 : 1)}%`;

export function abuseSignals(s: AbuseStats): AbuseSignal[] {
  const out: AbuseSignal[] = [];
  const total = s.legit + s.spam;
  if (total >= ABUSE.spamMinVolume && s.spam / total > ABUSE.spamRatio)
    out.push({ id: "spam_ratio", label: "Spam ratio over 90%", detail: `${s.spam} of ${total} submissions this month are spam (${pct(s.spam / total)}).`, severity: "warn" });
  if (s.deliveries >= ABUSE.minDeliveries && s.returned / s.deliveries > ABUSE.bounceRate)
    out.push({ id: "bounce_rate", label: "Bounce rate over 4%", detail: `${s.returned} of ${s.deliveries} deliveries returned in 30 days (${pct(s.returned / s.deliveries)}).`, severity: "high" });
  if (s.deliveries >= ABUSE.minDeliveries && s.complaints / s.deliveries > ABUSE.complaintRate)
    out.push({ id: "complaint_rate", label: "Complaint rate over 0.08%", detail: `${s.complaints} complaints on ${s.deliveries} deliveries in 30 days (${pct(s.complaints / s.deliveries)}).`, severity: "high" });
  if (s.sensitiveFields.length)
    out.push({ id: "sensitive_fields", label: "Credential or card field names", detail: `Recent submissions carry fields named ${s.sensitiveFields.slice(0, 5).join(", ")}. Check the form is not collecting passwords or card numbers.`, severity: "high" });
  return out;
}

// ---------------------------------------------------------------- workspace summary

export interface WorkspaceSummary {
  org: OrgRecord | null;
  orgId: string;
  suspended: OrgFlag | null;
  entitlement: Entitlement | null;
  forms: Form[];
  usage: { period: string; submissions: number; spam: number; held: number };
  spamRate: number;
  signals: AbuseSignal[];
  stats: AbuseStats;
  audit: { id: string; action: string; target?: string | null; at: Date; by?: string }[];
}

export async function workspaceSummary(db: Db, orgId: string, now = new Date()): Promise<WorkspaceSummary> {
  const period = periodOf(now);
  const since = new Date(now.getTime() - 30 * 864e5);
  const deliveries = db.docs<Delivery>("deliveries");
  const [org, flag, entitlement, forms, submissions, spam, held, total, returned, complaints, recent, log] = await Promise.all([
    getOrganization(orgId),
    db.docs<OrgFlag>("org_flags").get(orgId),
    db.getEntitlement(orgId),
    db.docs<Form>("forms").find({ orgId }, { sort: { createdAt: -1 }, limit: 200 }),
    db.getUsage(orgId, "submissions", period),
    db.getUsage(orgId, "spam", period),
    db.getUsage(orgId, "held", period),
    deliveries.count({ orgId, createdAt: { $gte: since } }),
    deliveries.count({ orgId, status: { $in: ["returned", "blocked"] }, createdAt: { $gte: since } }),
    deliveries.count({ orgId, status: "complaint", createdAt: { $gte: since } }),
    db.docs<Submission>("submissions").find({ orgId }, { sort: { receivedAt: -1 }, limit: 50 }),
    db.listAudit(orgId, { limit: 15 }),
  ]);
  const sensitiveFields = [...new Set(recent.flatMap((s) => Object.keys(s.fields)).filter((k) => SENSITIVE_FIELD.test(k)))];
  const stats: AbuseStats = { legit: submissions + held, spam, deliveries: total, returned, complaints, sensitiveFields };
  const all = stats.legit + stats.spam;
  return {
    org, orgId, suspended: flag?.suspended ? flag : null, entitlement, forms,
    usage: { period, submissions, spam, held }, spamRate: all ? spam / all : 0, signals: abuseSignals(stats), stats,
    audit: log.map((a) => ({ id: a.id, action: a.action, target: a.target, at: a.at, by: typeof a.meta?.by === "string" ? a.meta.by : undefined })),
  };
}

// ---------------------------------------------------------------- search

export interface SubmissionMeta { id: string; orgId: string; formId: string; status: string; receivedAt: Date; isTest: boolean; spamScore: number; signals: string[]; holdReason?: string }
export interface SearchResult { workspaces: OrgRecord[]; forms: Form[]; submission: SubmissionMeta | null }

/** Metadata only: submission field content is never returned here. */
export async function founderSearch(db: Db, q: string): Promise<SearchResult> {
  const needle = q.trim().slice(0, 100);
  if (!needle) return { workspaces: [], forms: [], submission: null };
  const forms = db.docs<Form>("forms");
  const [workspaces, byId, byKey, byName, sub] = await Promise.all([
    findOrganizations(needle),
    forms.get(needle),
    forms.findOne({ key: needle }),
    forms.find({ name: { $contains: needle } }, { limit: 20 }),
    db.docs<Submission>("submissions").get(needle),
  ]);
  const seen = new Map<string, Form>();
  for (const f of [byId, byKey, ...byName]) if (f) seen.set(f._id, f);
  const orgIds = new Set(workspaces.map((w) => w.id));
  // A workspace id with no auth record (deleted) still opens its summary.
  if (!orgIds.has(needle) && (await forms.count({ orgId: needle })) > 0) workspaces.push({ id: needle, name: "(no organization record)", slug: "" });
  return {
    workspaces, forms: [...seen.values()],
    submission: sub ? { id: sub._id, orgId: sub.orgId, formId: sub.formId, status: sub.status, receivedAt: sub.receivedAt, isTest: sub.isTest, spamScore: sub.spamScore, signals: sub.signals.map((s) => s.name), holdReason: sub.holdReason } : null,
  };
}

// ---------------------------------------------------------------- mail pipeline

export interface PipelineStatus {
  provider: string;
  webhooks: { provider: boolean; dsn: boolean };
  smtpConfigured: boolean;
  queued: number;
  oldestQueuedAt: Date | null;
  deferred: number;
  returned24h: number;
  failed24h: number;
  accepted24h: number;
  stuckReceived: number;
  lastInboundEventAt: Date | null;
}

export async function mailPipeline(db: Db, now = new Date()): Promise<PipelineStatus> {
  const d = db.docs<Delivery>("deliveries");
  const day = new Date(now.getTime() - 864e5);
  const e = env();
  const [queued, oldest, deferred, returned24h, failed24h, accepted24h, stuckReceived, lastEvent] = await Promise.all([
    d.count({ status: "queued" }),
    d.find({ status: "queued" }, { sort: { createdAt: 1 }, limit: 1 }),
    d.count({ status: "deferred" }),
    d.count({ status: "returned", lastEventAt: { $gte: day } }),
    d.count({ status: "failed", lastEventAt: { $gte: day } }),
    d.count({ status: "accepted", lastEventAt: { $gte: day } }),
    db.docs<Submission>("submissions").count({ status: "received", receivedAt: { $lt: new Date(now.getTime() - 2 * 60_000) } }),
    db.docs<{ _id: string; at: Date }>("mail_inbound_events").find({}, { sort: { at: -1 }, limit: 1 }),
  ]);
  return {
    provider: transportFromEnv().name,
    webhooks: { provider: !!e.MAIL_WEBHOOK_SECRET, dsn: !!e.DSN_WEBHOOK_SECRET },
    smtpConfigured: !!e.SMTP_HOST,
    queued, oldestQueuedAt: oldest[0]?.createdAt ?? null, deferred, returned24h, failed24h, accepted24h, stuckReceived,
    lastInboundEventAt: lastEvent[0]?.at ?? null,
  };
}

// ---------------------------------------------------------------- actions

const planIds = ["free", "starter", "pro", "agency"] as const satisfies readonly PlanId[];
export const METERS = ["submissions", "seats", "recipients", "integrations", "storage_mb"] as const satisfies readonly MeterId[];
const id = z.string().trim().min(1).max(100);
const reason = z.string().trim().max(300).optional();

export const FounderAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("form.suspend"), formId: id, reason }),
  z.object({ type: z.literal("form.unsuspend"), formId: id }),
  z.object({ type: z.literal("org.suspend"), orgId: id, reason }),
  z.object({ type: z.literal("org.unsuspend"), orgId: id }),
  z.object({ type: z.literal("plan.set"), orgId: id, plan: z.enum(planIds), reason }),
  z.object({ type: z.literal("limit.set"), orgId: id, meter: z.enum(METERS), value: z.number().int().min(0).max(100_000_000).nullable(), reason }),
  z.object({ type: z.literal("suppression.add"), email: z.string().trim().toLowerCase().email().max(200), scope: z.string().trim().min(1).max(120).default("all"), reason }),
  z.object({ type: z.literal("suppression.remove"), email: z.string().trim().toLowerCase().email().max(200), scope: z.string().trim().min(1).max(120).default("all"), reason }),
]);
export type FounderActionInput = z.infer<typeof FounderAction>;

type Meta = Record<string, string | number | boolean | null>;

async function setFormsSuspended(db: Db, forms: Form[], suspend: boolean, by: string) {
  const store = db.docs<Form>("forms");
  for (const f of forms) {
    if (suspend && f.status !== "suspended") await store.update({ _id: f._id }, { status: "suspended", preSuspendStatus: f.status === "paused" ? "paused" : "active", suspendedBy: by });
    else if (!suspend && f.status === "suspended") await store.update({ _id: f._id }, { status: f.preSuspendStatus ?? "active", preSuspendStatus: undefined, suspendedBy: undefined });
  }
}

/**
 * Runs one founder action and appends the audit entry (`admin.<type>`, actor id, `by` = email, the reason).
 * The caller must already have passed `assertFounder`; this checks again so no path skips it.
 */
export async function runFounderAction(db: Db, actor: Actor, input: FounderActionInput, now = new Date()): Promise<{ ok: true }> {
  assertFounder(actor.email);
  const meta: Meta = { by: actor.email };
  if ("reason" in input && input.reason) meta.reason = input.reason;
  let orgId: string | null = null;
  let target: string | null = null;

  switch (input.type) {
    case "form.suspend":
    case "form.unsuspend": {
      const f = await db.docs<Form>("forms").get(input.formId);
      if (!f) throw new HttpError(404, "not_found");
      await setFormsSuspended(db, [f], input.type === "form.suspend", actor.email);
      orgId = f.orgId; target = f._id;
      break;
    }
    case "org.suspend":
    case "org.unsuspend": {
      const suspend = input.type === "org.suspend";
      await db.docs<OrgFlag>("org_flags").update({ _id: input.orgId }, { suspended: suspend, reason: suspend && "reason" in input ? input.reason : undefined, at: now, by: actor.email }, { upsert: true });
      await setFormsSuspended(db, await db.docs<Form>("forms").find({ orgId: input.orgId }, { limit: 1000 }), suspend, actor.email);
      orgId = input.orgId; target = input.orgId;
      break;
    }
    case "plan.set": {
      const prev = await db.getEntitlement(input.orgId);
      const next: Entitlement = input.plan === "free" ? { ...NONE(now.getTime()), trialUsed: prev?.trialUsed ?? false } : lifetimeEntitlement(input.plan, `admin:${actor.id}`, now.getTime());
      if (prev?.limitOverrides) next.limitOverrides = prev.limitOverrides;
      await db.setEntitlement(input.orgId, next);
      meta.plan = planById(input.plan)?.id ?? input.plan; meta.previous = prev?.plan ?? "free";
      orgId = input.orgId; target = input.orgId;
      break;
    }
    case "limit.set": {
      const prev = (await db.getEntitlement(input.orgId)) ?? NONE(now.getTime());
      const overrides = { ...prev.limitOverrides };
      if (input.value === null) delete overrides[input.meter]; else overrides[input.meter] = input.value;
      const next: Entitlement = { ...prev, limitOverrides: Object.keys(overrides).length ? overrides : undefined };
      await db.setEntitlement(input.orgId, next);
      meta.meter = input.meter; meta.value = input.value;
      orgId = input.orgId; target = input.orgId;
      break;
    }
    case "suppression.add":
      await db.addSuppression({ email: input.email, scope: input.scope, reason: "manual", at: now });
      meta.scope = input.scope; target = input.email;
      orgId = input.scope.startsWith("org:") ? input.scope.slice(4) : null;
      break;
    case "suppression.remove":
      await db.removeSuppression(input.email, input.scope);
      meta.scope = input.scope; target = input.email;
      orgId = input.scope.startsWith("org:") ? input.scope.slice(4) : null;
      break;
  }
  await db.appendAudit({ orgId, actorId: actor.id, action: `admin.${input.type}`, target, meta });
  return { ok: true };
}
