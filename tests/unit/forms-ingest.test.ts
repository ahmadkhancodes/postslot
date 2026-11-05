import { describe, expect, it } from "vitest";
import { IngestError, MAX_BODY_BYTES, MAX_FIELDS, normaliseFields, originAllowed, parseBody, pickRedirect, wantsJson } from "@/lib/forms/ingest";
import { isFormKey, newFormKey } from "@/lib/forms/keys";

const post = (body: BodyInit, type?: string, extra: Record<string, string> = {}) =>
  new Request("http://localhost/f/k", { method: "POST", body, headers: { ...(type ? { "content-type": type } : {}), ...extra } });

describe("parseBody", () => {
  it("reads urlencoded, joining repeated names", async () => {
    const r = await parseBody(post("name=Ada&tag=a&tag=b&email=ada%40x.test", "application/x-www-form-urlencoded"));
    expect(r.kind).toBe("form");
    expect(r.fields).toEqual({ name: "Ada", tag: "a, b", email: "ada@x.test" });
  });

  it("reads JSON and flattens arrays and objects", async () => {
    const r = await parseBody(post(JSON.stringify({ name: "Ada", n: 3, ok: true, list: ["a", "b"], obj: { a: 1 }, nothing: null }), "application/json"));
    expect(r.kind).toBe("json");
    expect(r.fields).toEqual({ name: "Ada", n: "3", ok: "true", list: "a, b", obj: '{"a":1}', nothing: "" });
  });

  it("reads multipart text fields and rejects file parts with 422", async () => {
    const fd = new FormData();
    fd.set("name", "Ada");
    expect((await parseBody(post(fd))).fields).toEqual({ name: "Ada" });
    fd.set("cv", new File(["x"], "cv.txt"));
    await expect(parseBody(post(fd))).rejects.toMatchObject({ status: 422, code: "files_not_supported" });
  });

  it("rejects bodies over 100 KB (header and streamed) and more than 25 fields", async () => {
    await expect(parseBody(post("a=b", "application/x-www-form-urlencoded", { "content-length": String(MAX_BODY_BYTES + 1) }))).rejects.toMatchObject({ status: 413, code: "payload_too_large" });
    await expect(parseBody(post(`m=${"x".repeat(MAX_BODY_BYTES + 1)}`, "application/x-www-form-urlencoded"))).rejects.toMatchObject({ status: 413 });
    const many = Array.from({ length: MAX_FIELDS + 1 }, (_, i) => `f${i}=1`).join("&");
    await expect(parseBody(post(many, "application/x-www-form-urlencoded"))).rejects.toMatchObject({ status: 422, code: "too_many_fields" });
    const ok = Array.from({ length: MAX_FIELDS }, (_, i) => `f${i}=1`).join("&");
    expect(Object.keys((await parseBody(post(ok, "application/x-www-form-urlencoded"))).fields)).toHaveLength(MAX_FIELDS);
  });

  it("rejects malformed JSON and non-object JSON, drops prototype keys", async () => {
    await expect(parseBody(post("{nope", "application/json"))).rejects.toBeInstanceOf(IngestError);
    await expect(parseBody(post("[1]", "application/json"))).rejects.toMatchObject({ code: "bad_body" });
    expect((await parseBody(post('{"__proto__":"x","a":"1"}', "application/json"))).fields).toEqual({ a: "1" });
  });
});

describe("normaliseFields", () => {
  it("extracts special fields and strips them from the stored fields", () => {
    const n = normaliseFields({ email: "Ada@X.test", message: "hi", _subject: "Hello\r\nBcc: x", from_name: "Ada", _redirect: "https://a.test/ok", _gotcha: "", ps_token: "t", altcha: "p", replyto: "other@x.test" });
    expect(n.fields).toEqual({ email: "Ada@X.test", message: "hi" });
    expect(n.replyTo).toBe("other@x.test");
    expect(n.subject).toBe("Hello Bcc: x");
    expect(n.fromName).toBe("Ada");
    expect(n.redirect).toBe("https://a.test/ok");
    expect(n.psToken).toBe("t");
    expect(n.honeypotFilled).toBe(false);
  });

  it("uses email as Reply-To when valid, ignores invalid", () => {
    expect(normaliseFields({ email: "a@b.co" }).replyTo).toBe("a@b.co");
    expect(normaliseFields({ email: "not an email" }).replyTo).toBeUndefined();
  });

  it("detects the honeypot (_gotcha and botcheck), treating false/0 as empty", () => {
    expect(normaliseFields({ _gotcha: "x" }).honeypotFilled).toBe(true);
    expect(normaliseFields({ botcheck: "on" }).honeypotFilled).toBe(true);
    expect(normaliseFields({ botcheck: "false" }).honeypotFilled).toBe(false);
    expect(normaliseFields({ _gotcha: "  " }).honeypotFilled).toBe(false);
  });
});

describe("origin lock and redirects", () => {
  it("matches hosts, schemes and wildcards; empty list allows all; missing origin fails when locked", () => {
    expect(originAllowed([], null)).toBe(true);
    expect(originAllowed(["example.com"], "https://example.com")).toBe(true);
    expect(originAllowed(["https://example.com"], "http://example.com")).toBe(true);
    expect(originAllowed(["example.com"], "https://evil.com")).toBe(false);
    expect(originAllowed(["example.com"], "https://sub.example.com")).toBe(false);
    expect(originAllowed(["*.example.com"], "https://sub.example.com")).toBe(true);
    expect(originAllowed(["*.example.com"], "https://example.com")).toBe(false);
    expect(originAllowed(["example.com"], "https://example.com.evil.com")).toBe(false);
    expect(originAllowed(["example.com"], null)).toBe(false);
    expect(originAllowed(["example.com"], "not a url")).toBe(false);
  });

  it("only follows a posted redirect for allowed, posting or own origins (no open redirect)", () => {
    const form = { redirectUrl: "https://owner.test/thanks", allowedOrigins: ["site.test"] };
    expect(pickRedirect(form, "https://site.test/done", null, "https://app.test")).toBe("https://site.test/done");
    expect(pickRedirect(form, "https://evil.test/", null, "https://app.test")).toBe("https://owner.test/thanks");
    expect(pickRedirect(form, "javascript:alert(1)", null, "https://app.test")).toBe("https://owner.test/thanks");
    expect(pickRedirect({ redirectUrl: undefined, allowedOrigins: [] }, "https://evil.test/", null, "https://app.test")).toBeNull();
    expect(pickRedirect({ redirectUrl: undefined, allowedOrigins: [] }, "https://post.test/x", "https://post.test", "https://app.test")).toBe("https://post.test/x");
  });

  it("decides JSON vs redirect from Accept and content type", () => {
    const r = (h: Record<string, string>) => new Request("http://x/f/k", { method: "POST", headers: h });
    expect(wantsJson(r({ accept: "application/json" }), "form")).toBe(true);
    expect(wantsJson(r({ accept: "text/html,*/*" }), "json")).toBe(false);
    expect(wantsJson(r({}), "json")).toBe(true);
    expect(wantsJson(r({}), "form")).toBe(false);
  });
});

describe("form keys", () => {
  it("are 22 base62 characters and unique", () => {
    const keys = new Set(Array.from({ length: 200 }, () => newFormKey()));
    expect(keys.size).toBe(200);
    for (const k of keys) expect(isFormKey(k)).toBe(true);
    expect(isFormKey("short")).toBe(false);
  });
});
