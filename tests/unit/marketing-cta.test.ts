import { describe, expect, it } from "vitest";
import { ctaFor, planCtaFor } from "@/lib/marketing-cta";

describe("marketing CTA labels by viewer", () => {
  it("keeps signed-out calls to action", () => {
    expect(ctaFor("out", { href: "/sign-in", label: "Start free" })).toEqual({ href: "/sign-in", label: "Start free" });
  });
  it("sends signed-in visitors into the app", () => {
    expect(ctaFor("in", { href: "/sign-in", label: "Start free" })).toEqual({ href: "/app", label: "Open app" });
  });
  it("pricing: signed out goes to sign-in with the plan, signed in never says Start free", () => {
    const pro = { id: "pro", cta: "Choose Pro" };
    expect(planCtaFor("out", pro, false, "year").href).toBe("/sign-in?plan=pro&interval=year");
    expect(planCtaFor("in", pro, false, "year")).toEqual({ href: "/app/billing?plan=pro&interval=year", label: "Choose Pro" });
    expect(planCtaFor("in", { id: "free", cta: "Start free" }, true, "month")).toEqual({ href: "/app", label: "Open app" });
  });
});
