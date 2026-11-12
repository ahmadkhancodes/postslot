import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Postslot is light only (D-L1). Fails if dark mode or a theme toggle comes back in the source tree.
function walk(dir: string, out: string[] = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|css|mjs|html)$/.test(n)) out.push(p);
  }
  return out;
}
const files = walk("src");
const read = (f: string) => readFileSync(f, "utf8");

describe("light only", () => {
  const rules: [string, RegExp][] = [
    ["dark: utility", /(^|[\s"'`{:])(?:[a-z-]+:)*dark:[a-z\[!-]/m],
    ["prefers-color-scheme: dark", /prefers-color-scheme\s*:\s*dark/],
    ["data-theme / .dark token set", /data-theme|:root\.dark|\.dark\s*\{|custom-variant\s+dark/],
    ["theme storage or init script", /localStorage[^;]*theme|theme-script|themeInitScript/],
    ["theme toggle", /ThemeToggle|Switch to (dark|light) theme/],
    ["color-scheme: dark", /color-scheme\s*:\s*dark/],
  ];
  for (const [name, re] of rules) {
    it(`no ${name} in src`, () => {
      expect(files.filter((f) => re.test(read(f)))).toEqual([]);
    });
  }
  it("theme component and script are gone", () => {
    expect(files.filter((f) => /components\/theme\.tsx$|lib\/theme-script\.ts$/.test(f))).toEqual([]);
  });
  it("sets color-scheme: light", () => {
    expect(read("src/app/globals.css")).toMatch(/color-scheme:\s*light/);
  });
});
