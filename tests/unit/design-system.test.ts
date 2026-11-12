import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Guards the 12 Nov 2026 redesign (docs/design-brief.md): type pairing, palette, sharp radius, token-only spacing.
function walk(dir: string, out: string[] = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(n)) out.push(p);
  }
  return out;
}
const tsx = walk("src").filter((f) => f.endsWith(".tsx"));
const read = (f: string) => readFileSync(f, "utf8");
const css = read("src/app/globals.css");

describe("design system", () => {
  it("loads the serif display, grotesk text and mono faces, and no generic template fonts", () => {
    const fonts = read("src/app/fonts.ts");
    expect(fonts).toMatch(/Newsreader/);
    expect(fonts).toMatch(/Schibsted_Grotesk/);
    expect(fonts).toMatch(/JetBrains_Mono/);
    expect(fonts).not.toMatch(/Geist|Inter\b|Roboto|Open_Sans/);
    expect(fonts).not.toMatch(/"italic"/);
    expect(css).toMatch(/@utility heading-1 \{ font-family: var\(--font-display-family\)/);
  });

  it("uses the ink and rust palette, not the old violet or a default indigo", () => {
    expect(css).toMatch(/--accent: var\(--rust-500\)/);
    expect(css).toMatch(/--action: var\(--n-900\)/);
    expect(css.toLowerCase()).not.toMatch(/#6b3fc4|#5e34b1|#6366f1|#4f46e5|#7c3aed/);
  });

  it("caps every radius token at 4px (sharp personality)", () => {
    const radii = [...css.matchAll(/--radius(?:-[a-z0-9]+)?:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(radii.length).toBeGreaterThan(5);
    for (const r of radii) expect(r).toBeLessThanOrEqual(4);
  });

  it("uses only spacing steps defined in the theme, so no class silently compiles to nothing", () => {
    const defined = new Set([...css.matchAll(/--spacing-([0-9.\\]+):/g)].map((m) => m[1].replace("\\", "")));
    const prop = "p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-y|space-x|top|left|right|bottom|inset|inset-x|inset-y|w|h|size|min-h|min-w|max-h|max-w|translate-y|translate-x";
    const re = new RegExp(`(?:^|[\\s"'\`:])-?(?:${prop})-(\\d+(?:\\.5)?)(?=[\\s"'\`]|$)`, "gm");
    const bad: string[] = [];
    for (const f of tsx) {
      for (const m of read(f).matchAll(re)) if (!defined.has(m[1])) bad.push(`${f}: ${m[0].trim()}`);
    }
    expect(bad).toEqual([]);
  });

  it("has no gradient hero text, stat strip or glass surfaces left over", () => {
    for (const f of tsx) {
      const s = read(f);
      expect(s, f).not.toMatch(/hero-gradient-text|StatStrip/);
      // The one blurred surface is the floating marketing nav and its mobile panel (skill B7, owner directive 12 Nov 2026).
      if (!f.endsWith("site-header.tsx")) expect(s, f).not.toMatch(/backdrop-blur/);
    }
  });
});
