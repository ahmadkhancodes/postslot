// Word search shared by the memory driver and the tests. It mirrors what the Mongo text index (default_language "none") does for
// `{ $text: { $search } }`: case-insensitive whole words, no stemming, words split on anything that is not a letter or digit.
// Query grammar (same as Mongo): bare words are OR'd, "quoted phrases" are required, -word excludes.

export const tokenize = (s: string): string[] => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

export interface TextQuery { terms: string[]; phrases: string[][]; not: string[] }

export function parseTextQuery(q: string): TextQuery {
  const out: TextQuery = { terms: [], phrases: [], not: [] };
  const re = /(-?)"([^"]*)"|(-?)([^\s"]+)/g;
  for (let m = re.exec(q); m; m = re.exec(q)) {
    const neg = (m[1] ?? m[3]) === "-";
    if (m[2] !== undefined) {
      const words = tokenize(m[2]);
      if (!words.length) continue;
      if (neg) out.not.push(...words.slice(0, 1));
      else out.phrases.push(words);
    } else {
      for (const w of tokenize(m[4]!)) (neg ? out.not : out.terms).push(w);
    }
  }
  return out;
}

const hasPhrase = (tokens: string[], phrase: string[]) => {
  for (let i = 0; i + phrase.length <= tokens.length; i++) if (phrase.every((w, j) => tokens[i + j] === w)) return true;
  return false;
};

// Token lists are cached per text so a 100k row scan does not re-tokenise every query.
const cache = new WeakMap<object, { text: string; tokens: string[]; set: Set<string> }>();
const tokensOf = (owner: object, text: string) => {
  const hit = cache.get(owner);
  if (hit && hit.text === text) return hit;
  const tokens = tokenize(text);
  const fresh = { text, tokens, set: new Set(tokens) };
  cache.set(owner, fresh);
  return fresh;
};

export function matchText(owner: object, text: unknown, q: TextQuery | string): boolean {
  if (typeof text !== "string") return false;
  const query = typeof q === "string" ? parseTextQuery(q) : q;
  if (!query.terms.length && !query.phrases.length) return false;
  const { tokens, set } = tokensOf(owner, text);
  if (query.not.some((w) => set.has(w))) return false;
  if (!query.phrases.every((p) => (p.length === 1 ? set.has(p[0]!) : hasPhrase(tokens, p)))) return false;
  return !query.terms.length || query.terms.some((w) => set.has(w));
}
