import { describe, expect, it } from "vitest";
import { createMemoryDb } from "@/lib/db/memory";
import { addRecipient, sendVerification } from "@/lib/forms/recipients";
import type { Recipient } from "@/lib/forms/types";
import type { MailTransport } from "@/lib/mail";

const rejecting: MailTransport = {
  name: "resend",
  async send() {
    throw new Error("mail_send_failed_422");
  },
};

describe("launch hardening: Resend rejects", () => {
  it("adding a recipient with a rejected confirmation mail does not throw", async () => {
    const db = createMemoryDb("postslot");
    const r = await addRecipient(db, "o1", "bad@example.test", { transport: rejecting });
    expect(r?.email).toBe("bad@example.test");
  });
  it("resend returns false (no throw) and frees the throttle so the owner can retry", async () => {
    const db = createMemoryDb("postslot");
    const r = (await addRecipient(db, "o1", "bad@example.test", { transport: rejecting }))!;
    expect(await sendVerification(db, r, rejecting)).toBe(false);
    const fresh = (await db.docs<Recipient>("recipients").get(r._id))!;
    expect(fresh.verifySentAt).toBeUndefined();
  });
});
