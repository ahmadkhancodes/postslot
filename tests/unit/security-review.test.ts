import { describe, expect, it } from "vitest";
import { scopeOrgExport } from "@/lib/account-export";
import { can } from "@/lib/auth/roles";
import { createMemoryDb } from "@/lib/db/memory";
import { addRecipient, sendVerification, VERIFY_RESEND_MS } from "@/lib/forms/recipients";
import type { Recipient } from "@/lib/forms/types";
import { assertSameOrigin } from "@/lib/http";
import type { MailTransport } from "@/lib/mail";
import { isSafeWebhookUrl, safeLookup } from "@/lib/webhooks/outbound";

// Exploit regressions from docs/SECURITY-REVIEW.md. Each failed before its fix.

const exportData = () => ({
  billingAccount: { id: "o1", stripeCustomerId: "cus_1", email: "owner@a.test" },
  entitlement: { plan: "pro" },
  webhookEndpoints: [{ id: "w1", url: "https://hooks.a.test" }],
  auditLog: [{ action: "member.removed" }],
  forms: [{ _id: "f1" }],
  submissions: [{ _id: "s1" }],
});

describe("S-2 account export follows the role", () => {
  it("viewer: data only, no audit log, billing or webhooks", () => {
    expect(Object.keys(scopeOrgExport(exportData(), "viewer")).sort()).toEqual(["forms", "submissions"]);
  });
  it("member: data, billing and webhooks, no audit log", () => {
    expect(Object.keys(scopeOrgExport(exportData(), "member")).sort()).toEqual(["billingAccount", "entitlement", "forms", "submissions", "webhookEndpoints"]);
  });
  it("owner and admin get every section; an unknown or missing role gets nothing", () => {
    expect(Object.keys(scopeOrgExport(exportData(), "owner")).length).toBe(6);
    expect(Object.keys(scopeOrgExport(exportData(), "admin,member")).length).toBe(6);
    expect(scopeOrgExport(exportData(), null)).toEqual({});
    expect(scopeOrgExport(exportData(), "superuser")).toEqual({});
  });
});

describe("S-3 webhook SSRF", () => {
  it("rejects every private IPv4 literal at save time, including CGNAT, multicast and benchmark ranges", () => {
    for (const u of ["https://100.64.0.1/", "https://198.18.0.1/", "https://224.0.0.1/", "https://0x7f.1/", "https://2130706433/", "https://169.254.169.254/latest", "https://[::ffff:127.0.0.1]/"])
      expect(isSafeWebhookUrl(u), u).toBe(false);
    expect(isSafeWebhookUrl("https://hooks.example.com/x")).toBe(true);
    expect(isSafeWebhookUrl("https://93.184.216.34/x")).toBe(true);
  });
  it("the socket lookup refuses a name that resolves to a private address (DNS rebinding at connect time)", async () => {
    const run = (addrs: { address: string; family: number }[], all = false) =>
      new Promise<{ err: Error | null; addr: unknown }>((res) => safeLookup("rebind.test", { all }, (err, addr) => res({ err, addr }), async () => addrs));
    expect((await run([{ address: "10.0.0.5", family: 4 }])).err?.name).toBe("UnsafeTarget");
    expect((await run([{ address: "93.184.216.34", family: 4 }, { address: "::1", family: 6 }], true)).err?.name).toBe("UnsafeTarget");
    expect(await run([{ address: "93.184.216.34", family: 4 }])).toEqual({ err: null, addr: "93.184.216.34" });
    expect((await run([{ address: "93.184.216.34", family: 4 }], true)).addr).toEqual([{ address: "93.184.216.34", family: 4 }]);
  });
});

describe("S-4 API key permissions match the plugin's actions", () => {
  it("owner and admin may create, update and delete keys; member only reads; viewer nothing", () => {
    for (const a of ["create", "update", "delete", "read"]) {
      expect(can("owner", "apiKey", a)).toBe(true);
      expect(can("admin", "apiKey", a)).toBe(true);
    }
    expect(can("member", "apiKey", "create")).toBe(false);
    expect(can("member", "apiKey", "read")).toBe(true);
    expect(can("viewer", "apiKey", "read")).toBe(false);
  });
});

describe("S-5 CSRF guard", () => {
  const req = (h: Record<string, string>) => new Request("http://localhost:3100/api/forms", { method: "POST", headers: h });
  it("a cookie request is checked even when it also carries an Authorization or x-api-key header", () => {
    expect(() => assertSameOrigin(req({ cookie: "postslot.session_token=x", authorization: "Bearer junk", origin: "https://evil.test" }), ["http://localhost:3100"])).toThrow("bad_origin");
    expect(() => assertSameOrigin(req({ cookie: "postslot.session_token=x", "x-api-key": "junk", origin: "https://evil.test" }), ["http://localhost:3100"])).toThrow("bad_origin");
  });
  it("a key-only server request (no cookies) still passes, same-origin cookie requests too", () => {
    expect(() => assertSameOrigin(req({ authorization: "Bearer key" }), ["http://localhost:3100"])).not.toThrow();
    expect(() => assertSameOrigin(req({ cookie: "a=b", origin: "http://localhost:3100" }), ["http://localhost:3100"])).not.toThrow();
  });
});

describe("S-7 confirmation mail volume per address", () => {
  it("one address receives at most 5 confirmation mails a day, however many workspaces add it", async () => {
    const db = createMemoryDb("postslot");
    const sent: string[] = [];
    const transport: MailTransport = { name: "test", send: async (m) => { sent.push(m.to); return { id: `m${sent.length}` }; } } as MailTransport;
    const t0 = Date.now();
    for (let i = 0; i < 8; i++) {
      const r = (await addRecipient(db, `org${i}`, "victim@example.com", { transport, now: new Date(t0) })) as Recipient;
      await sendVerification(db, { ...r, verifySentAt: undefined }, transport, new Date(t0 + VERIFY_RESEND_MS + i));
    }
    expect(sent.length).toBe(5);
  });
});

describe("S-3 pinned webhook POST", () => {
  it("posts, returns the status without following redirects, refuses a private resolution and times out", async () => {
    const http = await import("node:http");
    const { pinnedPost } = await import("@/lib/webhooks/outbound");
    let got = "";
    const srv = http.createServer((req, res) => {
      if (req.url === "/slow") return; // never answers
      let b = ""; req.on("data", (c) => (b += c)); req.on("end", () => { got = b; res.writeHead(req.url === "/moved" ? 302 : 204, { location: "http://169.254.169.254/" }); res.end(); });
    });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as { port: number }).port;
    // Test-only lookup that lets the loopback server through; production uses safeLookup.
    const allow = ((_h: string, o: unknown, cb: (e: null, a: unknown, f?: number) => void) => (typeof o === "object" && (o as { all?: boolean })?.all ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(null, "127.0.0.1", 4))) as typeof safeLookup;
    expect(await pinnedPost(`http://hook.test:${port}/ok`, { "content-type": "application/json" }, '{"a":1}', 2000, allow)).toBe(204);
    expect(got).toBe('{"a":1}');
    expect(await pinnedPost(`http://hook.test:${port}/moved`, {}, "{}", 2000, allow)).toBe(302);
    await expect(pinnedPost(`http://localhost:${port}/ok`, {}, "{}", 2000)).rejects.toMatchObject({ name: "UnsafeTarget" });
    await expect(pinnedPost(`http://hook.test:${port}/slow`, {}, "{}", 300, allow)).rejects.toMatchObject({ name: "TimeoutError" });
    srv.closeAllConnections();
    srv.close();
  });
});
