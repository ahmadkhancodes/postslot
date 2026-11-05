import type { Form, Submission } from "@/lib/forms/types";

// Default notification template (compact and plain variants arrive in M3). Every value is escaped; no remote images.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const stripCtl = (s: string) => s.replace(/[\r\n\u0000-\u001f]+/g, " ").trim();

/** `{{field}}` variables from submission fields; missing fields render empty. Result is a header, so control chars are removed. */
export function renderSubject(template: string, form: Pick<Form, "name">, sub: Pick<Submission, "fields" | "subject">): string {
  if (sub.subject) return stripCtl(sub.subject).slice(0, 200);
  const out = template.replace(/\{\{\s*([\w.-]{1,60})\s*\}\}/g, (_, k: string) => (k === "form" ? form.name : sub.fields[k] ?? ""));
  return stripCtl(out).slice(0, 200) || `New submission on ${form.name}`;
}

export function renderNotification(form: Pick<Form, "name" | "subjectTemplate">, sub: Submission): { subject: string; text: string; html: string } {
  const subject = renderSubject(form.subjectTemplate, form, sub);
  const entries = Object.entries(sub.fields);
  const text = [`New submission on ${form.name}`, "", ...entries.map(([k, v]) => `${k}: ${v}`), "", sub.replyTo ? `Reply to this email to answer ${sub.replyTo}.` : "", "Sent with Postslot by BufferSol"].join("\n").trim();
  const rows = entries
    .map(([k, v]) => `<tr><th align="left" style="padding:6px 12px 6px 0;vertical-align:top;color:#55585f;font-weight:500">${esc(k)}</th><td style="padding:6px 0;white-space:pre-wrap">${esc(v)}</td></tr>`)
    .join("");
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f6f8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#17181c"><div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #e1e2e6;border-radius:8px;padding:24px"><p style="margin:0 0 16px;font-size:13px;color:#55585f">New submission on ${esc(form.name)}</p><table role="presentation" style="border-collapse:collapse;font-size:15px;width:100%">${rows}</table>${sub.replyTo ? `<p style="margin:16px 0 0;font-size:13px;color:#55585f">Reply to this email to answer ${esc(sub.replyTo)}.</p>` : ""}</div><p style="max-width:560px;margin:12px auto 0;font-size:12px;color:#6b6e76">Sent with Postslot by BufferSol</p></body></html>`;
  return { subject, text, html };
}

export function renderVerification(email: string, link: string): { subject: string; text: string; html: string } {
  const subject = "Confirm this address to receive form submissions";
  const text = `Someone added ${email} as a recipient on Postslot. Confirm it to start receiving submissions:\n\n${link}\n\nIf this was not you, ignore this email. Nothing is sent to this address until you confirm.`;
  const html = `<p>Someone added <b>${esc(email)}</b> as a recipient on Postslot. Confirm it to start receiving submissions:</p><p><a href="${esc(link)}">Confirm this address</a></p><p style="color:#55585f">If this was not you, ignore this email. Nothing is sent to this address until you confirm.</p>`;
  return { subject, text, html };
}
