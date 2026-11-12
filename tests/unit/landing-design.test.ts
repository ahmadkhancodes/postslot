import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomePage from "@/app/(marketing)/page";
import { Hero } from "@/components/marketing/hero";

// Landing page compliance with .claude/skills/landing-page-design (B1, B5, B7, B11). Browser checks: tests/e2e/landing-design.spec.ts.

const css = readFileSync("src/app/globals.css", "utf8");
const SCALE_REM = [0.75, 0.875, 1, 1.125, 1.25, 1.5, 1.875, 2.25, 3, 3.75, 4.5, 6, 8];

/** Visible text of server markup: drop scripts (JSON-LD), code samples and tags. */
function visibleText(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<(pre|code)[\s\S]*?<\/\1>/g, " ")
    .replace(/<[^>]*class="[^"]*\bcode-[12]\b[^"]*"[^>]*>[^<]*</g, "<")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

describe("landing page design library", () => {
  it("puts every named text style on a Tailwind type scale step, weight 700 or less, no italics", () => {
    const sizes = [...css.matchAll(/font-size:\s*([\d.]+)(rem|px)/g)].map((m) => (m[2] === "px" ? Number(m[1]) / 16 : Number(m[1])));
    expect(sizes.length).toBeGreaterThan(25);
    for (const s of sizes) expect(SCALE_REM, `font-size ${s}rem`).toContain(s);
    for (const m of css.matchAll(/font-weight:\s*(\d+)/g)) expect(Number(m[1])).toBeLessThanOrEqual(700);
    expect(css).not.toMatch(/font-style:\s*italic/);
  });

  it("draws the postmark with on scale font sizes", () => {
    const svg = readFileSync("src/components/marketing/demo/postmark.tsx", "utf8");
    const sizes = [...svg.matchAll(/fontSize="([\d.]+)"/g)].map((m) => Number(m[1]));
    expect(sizes).toEqual([14, 20, 12]);
  });

  it("caps the hero heading and subheading at 680px and offers one action", () => {
    const html = renderToStaticMarkup(
      createElement(Hero, { title: "Title", subtitle: "Sub", primaryCta: { href: "/sign-in", label: "Create a form" }, visual: null }),
    );
    expect(html).toMatch(/<h1[^>]*class="[^"]*max-w-\[680px\]/);
    expect(html).toMatch(/<p class="[^"]*max-w-\[680px\][^"]*">Sub<\/p>/);
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("keeps a space where the hero heading breaks the line", () => {
    const html = renderToStaticMarkup(createElement(HomePage));
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)![1].replace(/<[^>]+>/g, "");
    expect(h1).toBe("Every form submission, delivered with a receipt");
  });

  it("has no hyphenated words in visible landing copy (sample data and code excepted)", () => {
    const text = visibleText(renderToStaticMarkup(createElement(HomePage)));
    const allowed = /^(northfield-dental|cheap-seo-offer)$/; // fictional sample sender and domain in the inbox illustration
    const words = [...text.matchAll(/[A-Za-z]+(?:-[A-Za-z]+)+/g)].map((m) => m[0]).filter((w) => !allowed.test(w));
    expect(words).toEqual([]);
  });

  it("shows tagline words at full ink with no transition under reduced motion, muted to 30% otherwise", () => {
    expect(css).toMatch(/\.kit-word \{[^}]*opacity: 0\.3;[^}]*transition: opacity 500ms var\(--ease-out-kit\)/);
    const reduced = css.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/)![1];
    expect(reduced).toMatch(/\.kit-word \{ opacity: 1; transition: none; \}/);
    const tsx = readFileSync("src/components/marketing/tagline-reveal.tsx", "utf8");
    expect(tsx).toMatch(/prefers-reduced-motion: reduce/);
    expect(tsx).toMatch(/new IntersectionObserver/);
    expect(tsx).not.toMatch(/addEventListener\("scroll"/);
  });

  it("uses the base curve and no sub 200ms transitions in the marketing header", () => {
    const header = readFileSync("src/components/marketing/site-header.tsx", "utf8");
    expect(header).not.toMatch(/duration-(75|100|150)\b/);
    expect(header).toMatch(/STAGGER_MS = 60/);
    expect(header).toMatch(/STAGGER_CAP_MS = 400/);
    expect(css).toMatch(/--default-transition-timing-function: cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  });
});
