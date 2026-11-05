import type { Submission } from "@/lib/forms/types";

/** CSV cell: RFC 4180 quoting plus a guard against spreadsheet formula injection (=, +, -, @, tab, CR first). */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const FIXED = ["id", "received_at", "form", "status", "spam_score", "reply_to", "name", "subject"] as const;
export const MAX_FIELD_COLUMNS = 50;

export function toCsv(rows: Submission[], formNames: Record<string, string> = {}): string {
  const fieldCols = [...new Set(rows.flatMap((r) => Object.keys(r.fields)))].sort().slice(0, MAX_FIELD_COLUMNS);
  const head = [...FIXED, ...fieldCols].map(csvCell).join(",");
  const lines = rows.map((r) =>
    [r._id, r.receivedAt, formNames[r.formId] ?? r.formId, r.status, r.spamScore, r.replyTo, r.fromName, r.subject, ...fieldCols.map((c) => r.fields[c])].map(csvCell).join(","),
  );
  return `﻿${[head, ...lines].join("\r\n")}\r\n`;
}
