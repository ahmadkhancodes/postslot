import { appName, dbDriver, env } from "@/lib/env";
import { createMemoryDb } from "./memory";
import type { Db } from "./types";

export type { Db } from "./types";

declare global {
  var __kitMemoryDb: Db | undefined;
}

/** Picks the driver from env (ported dbFromEnv). Memory driver = stub mode when MONGODB_URI is missing. */
export async function getDb(): Promise<Db> {
  const e = env();
  const app = appName(e);
  if (dbDriver(e) === "memory") return (globalThis.__kitMemoryDb ??= createMemoryDb(app));
  if (!e.MONGODB_URI) throw new Error("MONGODB_URI not set");
  const { createMongoDb, scheduleEnsureIndexes, ensureIndexes } = await import("./mongo");
  const uri = e.MONGODB_URI;
  const name = e.MONGODB_DB ?? app;
  scheduleEnsureIndexes(`${uri}|${name}`, () => ensureIndexes(uri, name));
  return createMongoDb(uri, name, app);
}
