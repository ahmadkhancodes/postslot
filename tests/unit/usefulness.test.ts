import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { product } from "@/config/product";
import { docs } from "@/content/docs";
import { planThatFits } from "@/lib/billing/recommend";
import { stripeHost } from "@/lib/billing/stripe";
import { renderSubject } from "@/lib/delivery/templates";
import { normaliseFields } from "@/lib/forms/ingest";
import { checklist } from "@/lib/onboarding/checklist";
import { fixForm, lintHasErrors, lintSnippet } from "@/lib/onboarding/lint";
import { apiKeyCurl, snippetsFor } from "@/lib/onboarding/snippets";
import { signPayload } from "@/lib/webhooks/outbound";

const ENDPOINT = "https://postslot.buffersoltech.com/f/abcdefghijklmnopqrstuv";
const sample = (slug: string, heading: string) => docs.find((d) => d.slug === slug)!.sections.find((s) => s.heading === heading)!.code!.code;

describe("switching services: a form from Formspree, Web3Forms or FormSubmit works after changing the action", () => {
  it("_next redirects, _honey is the honeypot, access_key/_captcha/_template are not shown as fields", () => {
    const n = normaliseFields({ email: "a@x.test", message: "hi", _next: "https://site.test/thanks", access_key: "w3f-key", _captcha: "false", _template: "table", _honey: "" });
    expect(n.fields).toEqual({ email: "a@x.test", message: "hi" });
    expect(n.redirect).toBe("https://site.test/thanks");
    expect(n.honeypotFilled).toBe(false);
    expect(normaliseFields({ _honey: "bot was here" }).honeypotFilled).toBe(true);
    // the documented names still win over the aliases
    expect(normaliseFields({ _redirect: "https://a.test/1", _next: "https://a.test/2" }).redirect).toBe("https://a.test/1");
  });

  it("fixForm rewrites a Web3Forms form: endpoint, POST, no access_key, honeypot kept; fields untouched", () => {
    const w3f = `<form action="https://api.web3forms.com/submit" method="POST">
  <input type="hidden" name="access_key" value="YOUR_ACCESS_KEY_HERE">
  <input type="text" name="name" required>
  <input type="checkbox" name="botcheck" class="hidden" style="display: none;">
  <button type="submit">Submit Form</button>
</form>`;
    const fixed = fixForm(w3f, ENDPOINT)!;
    expect(fixed).toContain(`action="${ENDPOINT}"`);
    expect(fixed).not.toContain("access_key");
    expect(fixed).toContain('name="name" required');
    expect(fixed.match(/_gotcha/g)).toBeNull(); // botcheck already is a honeypot
    expect(lintHasErrors(lintSnippet(fixed, { endpoint: ENDPOINT }))).toBe(false);
  });

  it("fixForm repairs a Formspree form with no method and no honeypot, and a JSX action", () => {
    const fs = `<form action="https://formspree.io/f/xyzabcde">\n  <input type="email" name="email">\n  <textarea name="message"></textarea>\n  <button>Send</button>\n</form>`;
    const fixed = fixForm(fs, ENDPOINT)!;
    expect(fixed).toMatch(new RegExp(`<form action="${ENDPOINT}" method="POST">`));
    expect(fixed).toContain('name="_gotcha"');
    expect(lintSnippet(fixed, { endpoint: ENDPOINT })).toEqual([]);
    expect(fixForm(`<form action={url} method="post"><input name="email"><button>Go</button></form>`, ENDPOINT)).toContain(`action="${ENDPOINT}"`);
  });

  it("fixForm returns null when nothing changes or there is no form", () => {
    const good = `<form action="${ENDPOINT}" method="POST"><input name="email"><input type="text" name="_gotcha" style="display:none"><button>Send</button></form>`;
    expect(fixForm(good, ENDPOINT)).toBeNull();
    expect(fixForm("<div>no form</div>", ENDPOINT)).toBeNull();
  });
});

describe("snippets the reader copies are complete and personalised", () => {
  it("the fetch snippet defines everything it uses and posts this endpoint", () => {
    const f = snippetsFor(ENDPOINT, "https://postslot.buffersoltech.com").find((s) => s.id === "fetch")!.code;
    expect(f).toContain(`fetch("${ENDPOINT}"`);
    expect(f).toContain('const form = document.querySelector("form")');
    expect(f).toContain("new FormData(form)");
    expect(f).not.toMatch(/JSON\.stringify\(\{ email, message \}\)/);
  });

  it("the React snippet keeps the form before awaiting (currentTarget is null after the event)", () => {
    const r = snippetsFor(ENDPOINT, "https://x.test").find((s) => s.id === "react")!.code;
    expect(r.indexOf("const form = e.currentTarget")).toBeLessThan(r.indexOf("await fetch"));
    expect(r).not.toMatch(/await[\s\S]*e\.currentTarget/);
  });

  it("the API keys page and the docs share one curl, with the real key on the page", () => {
    expect(apiKeyCurl("https://app.test", "ps_live_123")).toBe('curl https://app.test/api/v1/me \\\n  -H "x-api-key: ps_live_123"');
    expect(sample("getting-started", "Make your first API request")).toBe(apiKeyCurl(product.url, "YOUR_API_KEY"));
    expect(sample("authentication", "API keys")).toBe(apiKeyCurl(product.url, "YOUR_API_KEY"));
  });
});

describe("docs samples that cannot run against the app in a browser run here against the real code", () => {
  it("the Node webhook verifier from the docs accepts the app's own signature and rejects a tampered one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "ps-docs-"));
    const file = join(dir, "verify.mjs");
    writeFileSync(file, sample("webhooks", "Verify a signature in Node"));
    const { verify } = (await import(/* @vite-ignore */ pathToFileURL(file).href)) as { verify: (b: string, h: string, s: string, t?: number) => boolean };
    const body = JSON.stringify({ event: "submission.created", data: { id: "sub_1" } });
    const header = await signPayload("whsec_docs", body);
    expect(verify(body, header, "whsec_docs")).toBe(true);
    expect(verify(body + " ", header, "whsec_docs")).toBe(false);
    expect(verify(body, header, "whsec_other")).toBe(false);
    expect(verify(body, await signPayload("whsec_docs", body, Math.floor(Date.now() / 1000) - 3600), "whsec_docs")).toBe(false);
  });

  it("the subject template in the docs renders with the form name and a field", () => {
    expect(renderSubject(sample("templates", "Subject"), { name: "Contact page" }, { fields: { name: "Ada" } })).toBe("New enquiry from Ada on Contact page");
  });
});

describe("day 7: which plan takes this month's submissions", () => {
  it("recommends the smallest paid plan above the current one that fits used plus held", () => {
    expect(planThatFits("free", { submissions: 200 })).toBeNull();
    expect(planThatFits("free", { submissions: 280 })?.id).toBe("starter");
    expect(planThatFits("starter", { submissions: 5001 })?.id).toBe("pro");
    expect(planThatFits("free", { submissions: 100, recipients: 4 })?.id).toBe("pro");
    expect(planThatFits("agency", { submissions: 1e9 })).toBeNull();
    // an admin-lowered limit is passed even though the Free list limit is not: the next plan up still fits
    expect(planThatFits("free", { submissions: 5 }, true)?.id).toBe("starter");
  });
});

describe("first ten minutes", () => {
  it("the checklist points the test step at the page that has the test button", () => {
    const c = checklist({ forms: 1, confirmedRecipient: true, testSubmissions: 0, realSubmissions: 0, firstFormId: "f1" });
    expect(c.steps.find((s) => s.id === "test")!.href).toBe("/app/forms/f1/onboarding");
  });
});

describe("Stripe stand-in switch", () => {
  it("only redirects a test key, never a live one", () => {
    expect(stripeHost("sk_test_x", "http://localhost:3199")).toEqual({ host: "localhost", port: 3199, protocol: "http" });
    expect(stripeHost("sk_live_x", "http://localhost:3199")).toEqual({});
    expect(stripeHost("rk_live_x", "http://localhost:3199")).toEqual({});
    expect(stripeHost("sk_test_x", undefined)).toEqual({});
  });
});

describe("plain-text docs for AI builders quote the real prices and limits", () => {
  it("llms.txt pricing line matches the plans in code", async () => {
    const { GET } = await import("@/app/llms.txt/route");
    const text = await GET().text();
    const usd = (c: number) => `$${c % 100 === 0 ? c / 100 : (c / 100).toFixed(2)}`;
    for (const p of product.plans) {
      if (!p.prices.length) expect(text).toContain(`${p.name} ${p.limits.submissions} submissions a month`);
      for (const pr of p.prices) expect(text).toContain(`${usd(pr.usd)} a ${pr.interval}`);
    }
    expect(text).toContain("_next");
  });
});
