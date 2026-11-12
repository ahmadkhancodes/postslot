// Structured JSON logs. Never log emails, tokens, codes or bodies (BACKEND_REUSE 1.11).
type Level = "debug" | "info" | "warn" | "error";
type Fields = { code?: string; route?: string; userId?: string; orgId?: string; [k: string]: unknown };

const SECRETISH = /(token|secret|password|authorization|cookie|email|code|^ip$|^to$|^from$|replyto|^body$|^fields$|^key$|apikey|^uri$)$/i;
const EMAIL_RE = /[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}/gi;
const URI_RE = /mongodb(\+srv)?:\/\/\S+/gi;
const BEARER_RE = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/** Free text (error messages) can carry an address, a connection string or a bearer token: mask them. */
export const scrubText = (v: string) => v.replace(URI_RE, "[uri]").replace(BEARER_RE, "$1 [redacted]").replace(EMAIL_RE, "[email]");

export function scrub(fields: Fields): Fields {
  const out: Fields = {};
  for (const [k, v] of Object.entries(fields)) out[k] = SECRETISH.test(k) && k !== "code" ? "[redacted]" : typeof v === "string" ? scrubText(v) : v;
  return out;
}

function emit(level: Level, msg: string, fields: Fields = {}) {
  if (process.env.NODE_ENV === "test" && level === "debug") return;
  const line = JSON.stringify({ level, msg, at: new Date().toISOString(), ...scrub(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (m: string, f?: Fields) => emit("debug", m, f),
  info: (m: string, f?: Fields) => emit("info", m, f),
  warn: (m: string, f?: Fields) => emit("warn", m, f),
  error: (m: string, f?: Fields) => emit("error", m, f),
};
