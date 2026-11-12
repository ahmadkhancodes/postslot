import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Secrets must never reach the browser. Runs against the production build when one exists (`npm run build` first; CI builds before testing).
const dir = ".next/static";
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.(js|css|html|json|txt)$/.test(f) ? [p] : []; });

const SECRET_NAMES = ["BETTER_AUTH_SECRET", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "RESEND_API_KEY", "CRON_SECRET", "MAIL_WEBHOOK_SECRET", "DSN_WEBHOOK_SECRET", "ALTCHA_HMAC_KEY", "SMTP_PASS", "SMTP_DKIM_PRIVATE_KEY", "GOOGLE_CLIENT_SECRET", "MONGODB_URI"];
const SECRET_SHAPES = [/sk_(live|test)_[A-Za-z0-9]{10,}/, /whsec_[A-Za-z0-9]{10,}/, /\bre_[A-Za-z0-9]{20,}/, /mongodb(\+srv)?:\/\/[^\s"'`]+@/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];

describe.skipIf(!existsSync(dir))("built client bundle", () => {
  const files = existsSync(dir) ? walk(dir) : [];
  const text = files.map((f) => ({ f, t: readFileSync(f, "utf8") }));
  it("contains no secret name, secret shape or live secret value", () => {
    const hits: string[] = [];
    const values = SECRET_NAMES.map((n) => process.env[n]).filter((v): v is string => !!v && v.length >= 12);
    for (const { f, t: raw } of text) {
      // better-auth's client ships a lazy env accessor (`get NAME(){return h("NAME")}`) that reads process.env, which is empty in a browser: a name, not a value.
      const t = raw.replace(/get ([A-Z_]+)\(\)\{return \w+\("\1"\)\}/g, "");
      for (const n of SECRET_NAMES) if (t.includes(n)) hits.push(`${f}: name ${n}`);
      for (const re of SECRET_SHAPES) if (re.test(t)) hits.push(`${f}: shape ${re}`);
      for (const v of values) if (t.includes(v)) hits.push(`${f}: a live secret value`);
    }
    expect(hits).toEqual([]);
  });
  it("only NEXT_PUBLIC variables are inlined", () => {
    expect(files.length).toBeGreaterThan(0);
  });
});
