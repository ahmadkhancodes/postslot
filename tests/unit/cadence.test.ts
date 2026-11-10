import { describe, expect, it } from "vitest";
import { cadence, cadenceCopy, SCHEDULER_CADENCE } from "@/config/product";
import { docs } from "@/content/docs";
import { readFileSync } from "node:fs";

const FAST = /\b(every (few )?minutes?|within minutes|30 seconds|1 minute, 5 minutes)\b/i;
const allText = (): string =>
  JSON.stringify(docs) + readFileSync("src/app/(marketing)/status/page.tsx", "utf8") + readFileSync("src/app/(marketing)/page.tsx", "utf8");

describe("scheduler cadence vs page copy", () => {
  it("vercel.json has only daily crons while the cadence is daily", () => {
    const crons = JSON.parse(readFileSync("vercel.json", "utf8")).crons as { schedule: string }[];
    if (SCHEDULER_CADENCE === "daily") for (const c of crons) expect(c.schedule).toMatch(/^\d+ \d+ \* \* \*$/);
  });
  it("pages use the cadence copy for retries and status", () => {
    const docText = JSON.stringify(docs);
    expect(docText).toContain(JSON.stringify(cadence.webhookRetries).slice(1, -1));
    expect(docText).toContain(JSON.stringify(cadence.mailRetries).slice(1, -1));
    expect(readFileSync("src/app/(marketing)/status/page.tsx", "utf8")).toContain("cadence.statusLine");
    expect(readFileSync("src/app/(marketing)/page.tsx", "utf8")).toContain("cadence.faqRetry");
  });
  it("no page promises faster than the cadence while it is daily", () => {
    if (SCHEDULER_CADENCE !== "daily") return;
    const text = allText().replace(cadenceCopy.frequent.mailRetries, "").replace(cadenceCopy.frequent.webhookRetries, "");
    expect(text).not.toMatch(FAST);
    expect(cadence.statusLine).not.toMatch(FAST);
    expect(cadence.mailRetries).not.toMatch(FAST);
    expect(cadence.webhookRetries).not.toMatch(FAST);
  });
});
