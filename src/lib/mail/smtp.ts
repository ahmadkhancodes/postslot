import { getDb } from "@/lib/db";
import { env, type Env } from "@/lib/env";
import { uuidv7 } from "@/lib/ids";
import type { MailTransport, SendResult } from "./types";

// Own-mail-server path behind the Mailer interface (docs/OWN_MTA.md). Works against any SMTP server
// (Postfix, KumoMTA, a relay). Selected with MAIL_PROVIDER=smtp; the default provider is unchanged.

export interface SmtpDkim {
  domainName: string;
  keySelector: string;
  /** PEM private key. Literal "\n" sequences are accepted so it fits in one env var. */
  privateKey: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  /** Implicit TLS (port 465). Port 587 upgrades with STARTTLS regardless. */
  secure: boolean;
  user?: string;
  pass?: string;
  dkim?: SmtpDkim;
  /** Domain of the VERP return path. Defaults to the domain of the From address. */
  bounceDomain?: string;
  /** Warm-up cap: messages per UTC day. 0 or missing = no cap. */
  dailyCap?: number;
}

/** The slice of a nodemailer transporter we use (a test passes a fake). */
export interface SmtpSender {
  sendMail(opts: Record<string, unknown>): Promise<{ messageId?: string; accepted?: unknown[]; rejected?: unknown[]; response?: string }>;
}
export type CreateSender = (options: Record<string, unknown>) => Promise<SmtpSender> | SmtpSender;

export function smtpConfigFromEnv(e: Env = env()): SmtpConfig | null {
  if (!e.SMTP_HOST) return null;
  const port = Number(e.SMTP_PORT ?? 587);
  const dkim = e.SMTP_DKIM_DOMAIN && e.SMTP_DKIM_SELECTOR && e.SMTP_DKIM_PRIVATE_KEY
    ? { domainName: e.SMTP_DKIM_DOMAIN, keySelector: e.SMTP_DKIM_SELECTOR, privateKey: e.SMTP_DKIM_PRIVATE_KEY.replace(/\\n/g, "\n") }
    : undefined;
  return {
    host: e.SMTP_HOST, port: Number.isFinite(port) ? port : 587, secure: e.SMTP_SECURE ? e.SMTP_SECURE === "true" || e.SMTP_SECURE === "1" : port === 465,
    user: e.SMTP_USER, pass: e.SMTP_PASS, dkim, bounceDomain: e.SMTP_BOUNCE_DOMAIN,
    dailyCap: e.SMTP_DAILY_CAP ? Number(e.SMTP_DAILY_CAP) || 0 : 0,
  };
}

/** nodemailer options for a config. DKIM signing is nodemailer's `dkim` option. */
export function nodemailerOptions(c: SmtpConfig): Record<string, unknown> {
  return {
    host: c.host, port: c.port, secure: c.secure,
    auth: c.user ? { user: c.user, pass: c.pass } : undefined,
    dkim: c.dkim,
    // Serverless: one connection per send, no pool kept alive.
    pool: false, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000,
  };
}

const domainOf = (addr: string) => (addr.match(/@([^>\s]+)>?\s*$/)?.[1] ?? "").toLowerCase();
const bareAddress = (addr: string) => addr.match(/<([^>]+)>/)?.[1] ?? addr.trim();

/**
 * VERP style return path: `bounce+<messageId>=<local>=<domain>@<bounceDomain>`.
 * A bounce delivered to that mailbox names the message and the recipient even when the DSN body is unreadable.
 */
export function verpReturnPath(messageId: string, recipient: string, bounceDomain: string): string {
  const [local = "", domain = ""] = recipient.toLowerCase().split("@");
  const safe = (x: string) => x.replace(/[^a-z0-9._+-]/g, "_");
  return `bounce+${messageId}=${safe(local)}=${safe(domain)}@${bounceDomain.toLowerCase()}`;
}

export function parseVerp(address: string): { messageId: string; recipient: string } | null {
  const m = bareAddress(address).toLowerCase().match(/^bounce\+([a-z0-9-]+)=([^=@]+)=([^=@]+)@/);
  return m ? { messageId: m[1]!, recipient: `${m[2]}@${m[3]}` } : null;
}

const defaultCreate: CreateSender = async (options) => {
  const nodemailer = (await import("nodemailer")).default;
  return nodemailer.createTransport(options) as unknown as SmtpSender;
};

export interface SmtpDeps {
  create?: CreateSender;
  /** Returns messages sent so far today including this one. Default: Db rate limiter keyed by UTC date. */
  dailyCount?: () => Promise<number>;
  now?: () => Date;
}

export function smtpTransport(config: SmtpConfig | null = smtpConfigFromEnv(), deps: SmtpDeps = {}): MailTransport {
  return {
    name: "smtp",
    async send(msg): Promise<SendResult> {
      if (!config) throw new Error("smtp_not_configured");
      const now = (deps.now ?? (() => new Date()))();
      if (config.dailyCap) {
        const count = deps.dailyCount
          ? await deps.dailyCount()
          : await (await getDb()).hitRateLimit(`smtp-daily:${now.toISOString().slice(0, 10)}`, 24 * 3600_000, now.getTime());
        if (count > config.dailyCap) throw new Error("smtp_daily_cap_reached"); // the delivery stays queued and retries
      }
      const id = uuidv7(now.getTime());
      const fromDomain = domainOf(msg.from) || config.dkim?.domainName || "localhost";
      const returnPath = verpReturnPath(id, msg.to, config.bounceDomain ?? fromDomain);
      const sender = await (deps.create ?? defaultCreate)(nodemailerOptions(config));
      const info = await sender.sendMail({
        from: msg.from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, replyTo: msg.replyTo,
        messageId: `<${id}@${fromDomain}>`,
        envelope: { from: returnPath, to: [msg.to] },
        headers: { ...msg.headers, "X-Postslot-Id": id },
      });
      if (info.rejected && info.rejected.length) throw new Error("smtp_rejected");
      return { id, provider: "smtp", accepted: true };
    },
  };
}
