// Field linter for the HTML a user pastes into the onboarding page. Pure string analysis (no DOM, so it runs in the browser and in tests).
// It only reads tags; it never executes or fetches anything.

export type LintSeverity = "error" | "warning" | "info";
export interface LintIssue { rule: LintRule; severity: LintSeverity; message: string; fix: string }
export type LintRule =
  | "no_form" | "no_action" | "wrong_action" | "get_method" | "missing_name" | "no_honeypot" | "file_input" | "no_submit"
  | "duplicate_name" | "no_email_field" | "too_many_fields" | "special_name_clash";

const MAX_FIELDS = 25; // ingest limit (src/lib/forms/ingest.ts)
const SKIP_TYPES = new Set(["submit", "button", "reset", "image"]);
const HONEYPOT = /^(_gotcha|botcheck)$/i;

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  // JSX `attr={expression}` (up to two brace levels) becomes the marker value "{expr}".
  const body = tag.replace(/^<\s*[a-zA-Z0-9-]+/, "").replace(/=\s*\{(?:[^{}]|\{[^{}]*\})*\}/g, '="{expr}"').replace(/\/?>$/, "");
  for (let m = re.exec(body); m; m = re.exec(body)) out[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  return out;
}
// JSX spells these differently; treat `{"..."}` expressions as present-but-unknown rather than missing.
const isExpr = (v: string | undefined) => v !== undefined && /^\{.*\}$/.test(v.trim());

export function lintSnippet(html: string, opts: { endpoint?: string } = {}): LintIssue[] {
  const issues: LintIssue[] = [];
  const add = (rule: LintRule, severity: LintSeverity, message: string, fix: string) => issues.push({ rule, severity, message, fix });
  const src = html.replace(/<!--[\s\S]*?-->/g, "");

  const formTag = /<form\b[^>]*>/i.exec(src)?.[0];
  if (!formTag) {
    add("no_form", "error", "No <form> tag found.", "Paste the whole form, from <form …> to </form>. If you post with fetch, the linter does not apply.");
    return issues;
  }
  const fa = attrs(formTag);
  if (fa.action === undefined) add("no_action", "error", "The form has no action attribute, so it posts back to the page it is on.", `Add action="${opts.endpoint ?? "https://…/f/<your form key>"}".`);
  else if (!isExpr(fa.action) && opts.endpoint && fa.action.trim() !== opts.endpoint) add("wrong_action", "error", "The form action is not this form's endpoint URL.", `Set action="${opts.endpoint}".`);
  else if (!isExpr(fa.action) && !opts.endpoint && !/\/f\/[0-9A-Za-z]{22}\b/.test(fa.action)) add("wrong_action", "warning", "The action does not look like a Postslot endpoint (…/f/<22 character key>).", "Copy the endpoint URL from the Install panel.");

  const method = fa.method?.trim().toLowerCase();
  if (!isExpr(fa.method) && method !== "post") add("get_method", "error", method ? `The form uses method="${fa.method}". Postslot only accepts POST.` : "The form has no method, and browsers default to GET, which Postslot does not accept.", 'Add method="POST".');

  const controls = [...src.matchAll(/<(input|textarea|select)\b[^>]*>/gi)].map((m) => ({ tag: m[1]!.toLowerCase(), a: attrs(m[0]) }));
  const named: string[] = [];
  let hasHoneypot = false;
  for (const { tag, a } of controls) {
    const type = (a.type ?? "text").toLowerCase();
    if (tag === "input" && (SKIP_TYPES.has(type) || type === "hidden" && !a.name)) continue;
    if (tag === "input" && type === "file") add("file_input", "error", "File inputs are not supported yet: a post with a file is rejected.", "Remove the file input, or ask for a link to the file in a text field.");
    if (!a.name?.trim() && !isExpr(a.name)) {
      const label = a.id ? `#${a.id}` : a.placeholder ? `"${a.placeholder}"` : `<${tag}${a.type ? ` type="${a.type}"` : ""}>`;
      add("missing_name", "error", `${label} has no name attribute, so its value is never sent.`, `Add name="…" (for example name="${type === "email" ? "email" : tag === "textarea" ? "message" : "name"}").`);
      continue;
    }
    const name = a.name!.trim();
    if (HONEYPOT.test(name)) { hasHoneypot = true; continue; }
    named.push(name);
  }
  const seen = new Set<string>();
  for (const n of named) {
    if (seen.has(n.toLowerCase()) && !issues.some((i) => i.rule === "duplicate_name" && i.message.includes(`"${n}"`)))
      add("duplicate_name", "info", `Two fields share the name "${n}". Their values are joined with a comma.`, "Fine for checkbox groups; otherwise give each field its own name.");
    seen.add(n.toLowerCase());
  }
  if (named.length > MAX_FIELDS) add("too_many_fields", "error", `The form has ${named.length} fields. Postslot accepts at most ${MAX_FIELDS}.`, "Remove fields or split the form.");
  const clash = named.find((n) => ["subject", "redirect", "replyto", "from_name"].includes(n.toLowerCase()));
  if (clash) add("special_name_clash", "info", `"${clash}" is a special field: it sets the email subject, redirect or Reply-To instead of showing as a normal field.`, "Rename it if you want it listed with the other fields.");
  if (!hasHoneypot) add("no_honeypot", "warning", "No honeypot field. Bots that fill every input will not be caught for free.", 'Add <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" style="display:none">.');
  else if (!controls.some(({ a }) => HONEYPOT.test(a.name ?? "") && (isExpr(a.style) || /display\s*:\s*none|visibility\s*:\s*hidden/i.test(a.style ?? "") || "hidden" in a || a.type === "hidden")))
    add("no_honeypot", "warning", "The honeypot field is visible, so real visitors may fill it and be marked as spam.", 'Hide it with style="display:none" (not just a small font).');
  if (!named.some((n) => n.toLowerCase() === "email")) add("no_email_field", "info", "No field named email, so replies cannot go to the visitor from the notification (no Reply-To).", 'Name the visitor\'s address field "email", or add a hidden _replyto field.');
  if (!/<button\b|type\s*=\s*["']?submit/i.test(src)) add("no_submit", "warning", "No submit button found.", 'Add <button type="submit">Send</button>.');
  return issues;
}

export const lintHasErrors = (issues: LintIssue[]) => issues.some((i) => i.severity === "error");
