import { dbDriver, env, isProd } from "@/lib/env";
import type { Db } from "@/lib/db/types";

export interface HealthResult {
  ok: boolean;
  db: string;
  ms: number;
  error?: string;
  /** Configuration state of the other dependencies. Booleans and short words only, never values or hostnames. */
  deps: { mail: "resend" | "smtp" | "console" | "none"; billing: "configured" | "stub"; webhookSecret: boolean; cron: boolean };
  /** Everything a production launch needs is in place. `false` never fails the probe (only the database does). */
  degraded: string[];
}

export function dependencyState(e = env(), prod = isProd()): Pick<HealthResult, "deps" | "degraded"> {
  const provider = e.MAIL_PROVIDER ?? (e.RESEND_API_KEY ? "resend" : "console");
  const mail = provider === "resend" && !e.RESEND_API_KEY ? "console" : provider;
  const deps = { mail, billing: e.STRIPE_SECRET_KEY ? "configured" : "stub", webhookSecret: !!e.STRIPE_WEBHOOK_SECRET, cron: !!e.CRON_SECRET } as const;
  const degraded: string[] = [];
  if (prod) {
    if (mail === "console" || mail === "none") degraded.push("mail_not_configured");
    if (deps.billing === "stub") degraded.push("billing_not_configured");
    if (deps.billing === "configured" && !deps.webhookSecret) degraded.push("stripe_webhook_secret_missing");
    if (!deps.cron) degraded.push("cron_secret_missing");
  }
  return { deps: { ...deps }, degraded };
}

/** Pings the database (one cheap read) with a timeout. Never throws. */
export async function checkHealth(getDb: () => Promise<Db>, timeoutMs = 1000): Promise<HealthResult> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const rest = dependencyState();
  try {
    const ping = (async () => (await getDb()).docs("uptime_checks").count({ _id: "__health__" }))();
    ping.catch(() => undefined); // a late rejection after the timeout must not become unhandled
    const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), timeoutMs); });
    await Promise.race([ping, timeout]);
    return { ok: true, db: dbDriver(), ms: Date.now() - started, ...rest };
  } catch (e) {
    return { ok: false, db: dbDriver(), ms: Date.now() - started, error: (e as Error).message === "timeout" ? "db_timeout" : "db_unreachable", ...rest };
  } finally {
    clearTimeout(timer);
  }
}
