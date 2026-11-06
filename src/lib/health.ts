import { dbDriver } from "@/lib/env";
import type { Db } from "@/lib/db/types";

export interface HealthResult { ok: boolean; db: string; ms: number; error?: string }

/** Pings the database (one cheap read) with a timeout. Never throws. */
export async function checkHealth(getDb: () => Promise<Db>, timeoutMs = 1000): Promise<HealthResult> {
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const ping = (async () => (await getDb()).docs("uptime_checks").count({ _id: "__health__" }))();
    const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error("timeout")), timeoutMs); });
    await Promise.race([ping, timeout]);
    return { ok: true, db: dbDriver(), ms: Date.now() - started };
  } catch (e) {
    return { ok: false, db: dbDriver(), ms: Date.now() - started, error: (e as Error).message === "timeout" ? "db_timeout" : "db_unreachable" };
  } finally {
    clearTimeout(timer);
  }
}
