import { describe, expect, it } from "vitest";
import { createMemoryDb } from "@/lib/db/memory";
import { DEFAULT_RULES, type Form, type Submission } from "@/lib/forms/types";
import { MIN_DOCS, bayesProbability, bayesSignal, tokenize, train } from "@/lib/spam/bayes";
import { combineScore, countLinks, evaluateRules } from "@/lib/spam/rules";
import { scoreSubmission, thresholdFor } from "@/lib/spam/score";
import { STALE_MS, TOO_FAST_MS, issueTimeToken, timeTokenSignals } from "@/lib/spam/timetoken";

describe("signed time token", () => {
  const secret = "s3cret";
  it("missing token adds nothing; a fresh human-speed token adds nothing", async () => {
    expect(await timeTokenSignals(secret, "KEY", undefined)).toEqual([]);
    const t = await issueTimeToken(secret, "KEY", 1_000_000);
    expect(await timeTokenSignals(secret, "KEY", t, 1_000_000 + 10_000)).toEqual([]);
  });
  it("too fast, stale, forged and wrong-form tokens each add 0.6", async () => {
    const t = await issueTimeToken(secret, "KEY", 1_000_000);
    expect((await timeTokenSignals(secret, "KEY", t, 1_000_000 + TOO_FAST_MS - 1))[0]).toMatchObject({ name: "too_fast", weight: 0.6 });
    expect((await timeTokenSignals(secret, "KEY", t, 1_000_000 + STALE_MS + 1))[0]).toMatchObject({ name: "stale_token", weight: 0.6 });
    expect((await timeTokenSignals(secret, "KEY", `${t}0`, 1_000_000 + 10_000))[0]).toMatchObject({ name: "bad_token" });
    expect((await timeTokenSignals(secret, "OTHER", t, 1_000_000 + 10_000))[0]).toMatchObject({ name: "bad_token" });
    expect((await timeTokenSignals(secret, "KEY", "garbage", 5))[0]).toMatchObject({ name: "bad_token" });
  });
});

describe("rules engine", () => {
  it("counts links", () => {
    expect(countLinks("see http://a.test and https://b.test/x and www.c.test")).toBe(3);
    expect(countLinks("no links, email a@b.co")).toBe(0);
  });
  it("link count over the limit raises weight with each link", () => {
    expect(evaluateRules("http://a.test http://b.test", undefined, DEFAULT_RULES)).toEqual([]);
    const s = evaluateRules("http://a.test http://b.test http://c.test", undefined, DEFAULT_RULES);
    expect(s[0]).toMatchObject({ name: "links", weight: 0.55 });
  });
  it("blocked phrases are case-insensitive", () => {
    const s = evaluateRules("Buy CHEAP pills now", undefined, { ...DEFAULT_RULES, blockedPhrases: ["cheap pills"] });
    expect(s[0]).toMatchObject({ name: "blocked_phrase", weight: 0.6 });
  });
  it("script and iframe markup is flagged unless disabled", () => {
    expect(evaluateRules("<script>x</script>", undefined, DEFAULT_RULES)[0]).toMatchObject({ name: "script_tag", weight: 0.9 });
    expect(evaluateRules("<IFRAME src=x>", undefined, DEFAULT_RULES)).toHaveLength(1);
    expect(evaluateRules("<script>", undefined, { ...DEFAULT_RULES, blockScripts: false })).toEqual([]);
  });
  it("disposable email domains are flagged unless disabled", () => {
    expect(evaluateRules("hi", "a@mailinator.com", DEFAULT_RULES)[0]).toMatchObject({ name: "disposable_email", weight: 0.5 });
    expect(evaluateRules("hi", "a@gmail.com", DEFAULT_RULES)).toEqual([]);
    expect(evaluateRules("hi", "a@mailinator.com", { ...DEFAULT_RULES, blockDisposable: false })).toEqual([]);
  });
  it("combines weights as 1 - product(1 - w)", () => {
    expect(combineScore([])).toBe(0);
    expect(combineScore([{ weight: 0.5 }, { weight: 0.6 }])).toBe(0.8);
    expect(combineScore([{ weight: 1 }, { weight: 0.2 }])).toBe(1);
  });
});

describe("bayes", () => {
  it("tokenizes words and sender domains once each", () => {
    expect(tokenize("Cheap cheap PILLS from bob@spam.example")).toEqual(expect.arrayContaining(["cheap", "pills", "email:spam.example"]));
    expect(tokenize("cheap cheap").filter((t) => t === "cheap")).toHaveLength(1);
  });
  it("probability leans toward the trained side", () => {
    const totals = { spam: 10, ham: 10 };
    expect(bayesProbability([{ spam: 9, ham: 0 }, { spam: 8, ham: 0 }], totals)).toBeGreaterThan(0.95);
    expect(bayesProbability([{ spam: 0, ham: 9 }], totals)).toBeLessThan(0.1);
    expect(bayesProbability([{ spam: 0, ham: 0 }], totals)).toBeCloseTo(0.5, 5);
  });
  it("cold start emits no signal; trained spam text emits one; ham text does not", async () => {
    const db = createMemoryDb("postslot");
    expect(await bayesSignal(db, "f1", "cheap pills")).toBeNull();
    for (let i = 0; i < MIN_DOCS + 1; i++) {
      await train(db, "o1", "f1", `cheap pills casino winner prize ${i}`, "spam");
      await train(db, "o1", "f1", `project quote website redesign meeting ${i}`, "ham");
    }
    const s = await bayesSignal(db, "f1", "cheap pills casino winner");
    expect(s).toMatchObject({ name: "bayes" });
    expect(s!.weight).toBeGreaterThan(0.6);
    expect(await bayesSignal(db, "f1", "project quote website redesign meeting")).toBeNull();
  });
  it("falls back to the global scope for a form without training", async () => {
    const db = createMemoryDb("postslot");
    for (let i = 0; i < MIN_DOCS + 1; i++) {
      await train(db, "o1", "f1", `cheap pills casino winner ${i}`, "spam");
      await train(db, "o1", "f1", `project quote meeting ${i}`, "ham");
    }
    expect((await bayesSignal(db, "other-form", "cheap pills casino winner"))?.detail).toContain("all forms");
  });
});

describe("score", () => {
  const form = { _id: "f1", key: "K", spamMode: "standard", spamThreshold: 0.7, rules: DEFAULT_RULES } as Form;
  const sub = (over: Partial<Submission>) => ({ _id: "s", signals: [], searchText: "hello", replyTo: undefined, emailLower: undefined, ...over }) as Submission;

  it("two moderate signals cross the 0.7 threshold; one does not", async () => {
    const db = createMemoryDb("postslot");
    const one = await scoreSubmission(db, form, sub({ replyTo: "a@mailinator.com", searchText: "hello" }));
    expect(one.spam).toBe(false);
    const two = await scoreSubmission(db, form, sub({ replyTo: "a@mailinator.com", searchText: "http://a.test http://b.test http://c.test" }));
    expect(two.spam).toBe(true);
    expect(two.signals.map((s) => s.name)).toEqual(expect.arrayContaining(["links", "disposable_email"]));
  });
  it("edge signals carry into the score", async () => {
    const db = createMemoryDb("postslot");
    const v = await scoreSubmission(db, form, sub({ signals: [{ name: "too_fast", weight: 0.6 }], searchText: "<script>" }));
    expect(v.spam).toBe(true);
  });
  it("strict mode lowers the threshold, off skips content rules", async () => {
    const db = createMemoryDb("postslot");
    expect(thresholdFor({ spamMode: "strict", spamThreshold: 0.7 })).toBe(0.5);
    expect((await scoreSubmission(db, { ...form, spamMode: "strict" }, sub({ replyTo: "a@mailinator.com" }))).spam).toBe(true);
    expect((await scoreSubmission(db, { ...form, spamMode: "off" }, sub({ searchText: "<script>" }))).spam).toBe(false);
  });
  it("an allowed sender skips content scoring but not edge signals", async () => {
    const db = createMemoryDb("postslot");
    await db.docs("sender_allow").insert({ _id: "f1|a@x.test" });
    const ok = await scoreSubmission(db, form, sub({ emailLower: "a@x.test", searchText: "<script>" }));
    expect(ok.spam).toBe(false);
    expect(ok.allowedSender).toBe(true);
    const edge = await scoreSubmission(db, form, sub({ emailLower: "a@x.test", signals: [{ name: "honeypot", weight: 1 }] }));
    expect(edge.spam).toBe(true);
  });
});
