import type { Form, Submission, TemplateId } from "@/lib/forms/types";

// Notification templates: default, compact table, plain text. Every value is escaped; no remote images.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const stripCtl = (s: string) => s.replace(/[\r\n\u0000-\u001f]+/g, " ").trim();

/** `{{field}}` variables from submission fields; missing fields render empty. Result is a header, so control chars are removed. */
export function renderSubject(template: string, form: Pick<Form, "name">, sub: Pick<Submission, "fields" | "subject">): string {
  if (sub.subject) return stripCtl(sub.subject).slice(0, 200);
  const out = template.replace(/\{\{\s*([\w.-]{1,60})\s*\}\}/g, (_, k: string) => (k === "form" ? form.name : sub.fields[k] ?? ""));
  return stripCtl(out).slice(0, 200) || `New submission on ${form.name}`;
}

type NotifyForm = Pick<Form, "name" | "subjectTemplate"> & { template?: TemplateId };
export interface Rendered { subject: string; text: string; html: string }

const FOOT = "Sent with Postslot by BufferSol";
const replyLine = (sub: Pick<Submission, "replyTo">) => (sub.replyTo ? `Reply to this email to answer ${sub.replyTo}.` : "");
const TEST_NOTE = "This is a test submission sent from your dashboard. It is not counted on your meter.";

function plainText(form: NotifyForm, sub: Submission, entries: [string, string][]): string {
  return [
    ...(sub.isTest ? [TEST_NOTE, ""] : []),
    `New submission on ${form.name}`, "", ...entries.map(([k, v]) => `${k}: ${v}`), "", replyLine(sub), FOOT,
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const shell = (inner: string) =>
  `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f5f1;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1d24"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e4e2dc;border-radius:4px;padding:24px">${inner}</div><p style="max-width:560px;margin:12px auto 0;font-size:12px;color:#63666e">${FOOT}</p></body></html>`;
const testBanner = (sub: Submission) => (sub.isTest ? `<p style="margin:0 0 16px;padding:8px 12px;font-size:13px;background:#f3ead8;border:1px solid #dccba8;border-radius:2px;color:#1a1d24">${esc(TEST_NOTE)}</p>` : "");
const replyHtml = (sub: Submission) => (sub.replyTo ? `<p style="margin:16px 0 0;font-size:13px;color:#4f525a">${esc(replyLine(sub))}</p>` : "");

function defaultHtml(form: NotifyForm, sub: Submission, entries: [string, string][]): string {
  const rows = entries
    .map(([k, v]) => `<tr><th align="left" style="padding:6px 12px 6px 0;vertical-align:top;color:#4f525a;font-weight:500">${esc(k)}</th><td style="padding:6px 0;white-space:pre-wrap">${esc(v)}</td></tr>`)
    .join("");
  return shell(`${testBanner(sub)}<p style="margin:0 0 16px;font-size:13px;color:#4f525a">New submission on ${esc(form.name)}</p><table role="presentation" style="border-collapse:collapse;font-size:15px;width:100%">${rows}</table>${replyHtml(sub)}`);
}

function compactHtml(form: NotifyForm, sub: Submission, entries: [string, string][]): string {
  const rows = entries
    .map(([k, v]) => `<tr><th align="left" style="padding:4px 8px;border:1px solid #e4e2dc;background:#f6f5f1;font-size:12px;font-weight:600;vertical-align:top;white-space:nowrap">${esc(k)}</th><td style="padding:4px 8px;border:1px solid #e4e2dc;font-size:13px;white-space:pre-wrap">${esc(v)}</td></tr>`)
    .join("");
  return shell(`${testBanner(sub)}<p style="margin:0 0 8px;font-size:12px;color:#4f525a">${esc(form.name)}</p><table style="border-collapse:collapse;width:100%">${rows}</table>${replyHtml(sub)}`);
}

/**
 * The notification email for one submission. The dashboard preview calls this same function with a sample submission
 * (see `previewNotification`), so what you see is what is sent. Every value is escaped; no remote images.
 * The plain template sends text only: `html` is an empty string and the Mailer sends a text-only message.
 */
export function renderNotification(form: NotifyForm, sub: Submission): Rendered {
  const base = renderSubject(form.subjectTemplate, form, sub);
  const subject = sub.isTest ? `[Test] ${base}`.slice(0, 200) : base;
  const entries = Object.entries(sub.fields);
  const text = plainText(form, sub, entries);
  const t = form.template ?? "default";
  const html = t === "plain" ? "" : t === "compact" ? compactHtml(form, sub, entries) : defaultHtml(form, sub, entries);
  return { subject, text, html };
}

/** Sample data shown in the template preview and used by the parity test. */
export function sampleSubmission(form: Pick<Form, "_id" | "orgId">): Submission {
  const at = new Date("2026-01-15T09:30:00Z");
  return {
    _id: "sample", orgId: form.orgId, formId: form._id, receivedAt: at, status: "delivered",
    fields: { name: "Mara Okafor", email: "mara@example.com", message: "Hi! Could you quote a rebrand of our site?\nWe launch in March." },
    replyTo: "mara@example.com", searchText: "", spamScore: 0, signals: [], scored: true, isTest: false, ipHash: "sample",
  };
}

export const previewNotification = (form: NotifyForm & Pick<Form, "_id" | "orgId">): Rendered => renderNotification(form, sampleSubmission(form));

export function renderVerification(email: string, link: string): { subject: string; text: string; html: string } {
  const subject = "Confirm this address to receive form submissions";
  const text = `Someone added ${email} as a recipient on Postslot. Confirm it to start receiving submissions:\n\n${link}\n\nIf this was not you, ignore this email. Nothing is sent to this address until you confirm.`;
  const html = `<p>Someone added <b>${esc(email)}</b> as a recipient on Postslot. Confirm it to start receiving submissions:</p><p><a href="${esc(link)}">Confirm this address</a></p><p style="color:#4f525a">If this was not you, ignore this email. Nothing is sent to this address until you confirm.</p>`;
  return { subject, text, html };
}
