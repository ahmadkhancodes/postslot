import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "../../src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
const isClient = (src: string) => /^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*["']use client["']/.test(src);

function resolve(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? path.join(SRC, spec.slice(2)) : spec.startsWith(".") ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), path.join(base, "index.tsx")]) {
    try { if (statSync(c).isFile()) return c; } catch { /* next */ }
  }
  return null;
}

/** Names exported by a client module that are NOT React components (PascalCase). Those become opaque client references on the server. */
function nonComponentExports(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g)) out.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) for (const n of m[1].split(",")) { const name = n.trim().split(/\s+as\s+/).pop()!; if (name) out.add(name); }
  return new Set([...out].filter((n) => !/^[A-Z]/.test(n)));
}

describe("use client boundary", () => {
  it("server files never import non-component exports from a 'use client' module", () => {
    const files = walk(SRC);
    const clientCache = new Map<string, Set<string> | null>();
    const info = (f: string) => {
      if (!clientCache.has(f)) { const s = readFileSync(f, "utf8"); clientCache.set(f, isClient(s) ? nonComponentExports(s) : null); }
      return clientCache.get(f)!;
    };
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      if (isClient(src)) continue;
      for (const m of src.matchAll(/import\s+(?!type\b)([^;]*?)\s+from\s+["']([^"']+)["']/g)) {
        const target = resolve(file, m[2]);
        if (!target) continue;
        const bad = info(target);
        if (!bad) continue;
        const named = /\{([^}]*)\}/.exec(m[1])?.[1] ?? "";
        for (const n of named.split(",")) {
          const t = n.trim();
          if (!t || t.startsWith("type ")) continue;
          const orig = t.split(/\s+as\s+/)[0];
          if (bad.has(orig)) offenders.push(`${path.relative(SRC, file)} imports ${orig} from ${m[2]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
