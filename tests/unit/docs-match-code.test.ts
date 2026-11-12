import { describe, expect, it } from "vitest";
import { MAX_BODY_BYTES, MAX_FIELDS } from "@/lib/forms/ingest";
import { RULES } from "@/lib/security/ratelimit";
import { product } from "@/config/product";
import { docs } from "@/content/docs";

const text = JSON.stringify(docs);

// QA: numbers in the public docs and pricing copy must be the numbers the code enforces.
describe("public numbers match the code", () => {
  it("endpoint limits in the docs", () => {
    expect(text).toContain(`${MAX_BODY_BYTES / 1024} KB`);
    expect(text).toContain(`${MAX_FIELDS} fields`);
    expect(text).toContain(`${RULES.formIp.limit} posts a minute per visitor`);
    expect(text).toContain(`${RULES.formKey.limit} a minute per form`);
  });
  it("free plan numbers in the highlights", () => {
    const free = product.plans[0]!;
    expect(free.highlights[0]).toContain(String(free.limits.submissions));
    expect(free.highlights.join(" ")).toContain(`${free.retentionDays} day`);
  });
  it("every plan's highlights quote its own limits", () => {
    for (const p of product.plans.slice(1)) {
      const h = p.highlights.join(" | ");
      expect(h, p.id).toContain(p.limits.submissions.toLocaleString("en-US"));
      expect(h, p.id).toContain(`${p.limits.recipients} recipient`);
    }
  });
});
