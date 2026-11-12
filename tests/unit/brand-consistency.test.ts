import { magicLinkEmail, noticeEmail } from "@/lib/mail/templates";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// After the redesign (docs/design-brief.md: ink, paper, manila, rust) no file may carry the old violet/grey brand,
// including e-mails and raw HTML responses that do not use the Tailwind tokens.
function walk(dir: string, out: string[] = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css)$/.test(n)) out.push(p);
  }
  return out;
}
const OLD = [/#f1eefb/i, /#3b2a7a/i, /#17181c/i, /#f6f6f8/i, /#e1e2e6/i, /#55585f/i, /#6b6e76/i, /#f7f7f7/i, /#181818/i, /#e2e2e2/i, /#767676/i, /#404040/i, /#7c3aed/i, /#6d28d9/i, /#8b5cf6/i, /geist/i, /violet|purple|indigo/i];


describe("brand consistency", () => {
  it("no old brand colour or font anywhere in src", () => {
    const hits: string[] = [];
    for (const f of walk("src")) {
      const s = readFileSync(f, "utf8");
      for (const re of OLD) if (re.test(s)) hits.push(`${f}: ${re}`);
    }
    expect(hits).toEqual([]);
  });
  it("global error boundary loads the brand fonts", () => {
    expect(readFileSync("src/app/global-error.tsx", "utf8")).toMatch(/display\.variable/);
  });
  it("rendered e-mails use ink and paper", () => {
    for (const m of [magicLinkEmail("https://x.test/a"), noticeEmail({ title: "T", body: "B" })]) {
      expect(m.html).toContain("#1a1d24");
      expect(m.html).toContain("#f6f5f1");
    }
  });
});
