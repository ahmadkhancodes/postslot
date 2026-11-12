import { Section } from "@/components/ui/layout";
import { Timeline } from "./demo/receipt";
import { StatusChip } from "./demo/receipt";

/** Section 2 of the page: one opened letter with its receipt, beside the usage meter and the spam note. */
export function InboxExplainer() {
  return (
    <Section space="lg" labelledBy="inbox-title">
      <div className="flex max-w-2xl flex-col gap-4">
        <p className="label-mono text-accent">The inbox</p>
        <h2 id="inbox-title" className="heading-4 md:heading-2 text-text">Open the letter. Show the time.</h2>
        <p className="body-3 text-text-subtle">
          The inbox lists every submission as a ruled row with its status in words and an icon. Spam waits in quarantine with the signals that caught it. Held submissions wait for your upgrade or the next month.
        </p>
      </div>
      <div className="mt-12 grid gap-8 lg:grid-cols-12 lg:gap-12">
        <div className="flex min-w-0 flex-col gap-4 rounded border border-border-receipt bg-surface-receipt p-6 shadow-stamp md:p-8 lg:col-span-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="title-3 text-text">Hi, can I book a cleaning for next Tuesday?</p>
              <p className="mt-1 break-words code-2 text-text-muted">sub_01JC8F2Q · Contact form · 5 Nov 2026 14:02:03 UTC</p>
            </div>
            <StatusChip status="Delivered" />
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-y border-dashed border-border-receipt py-4">
            <dt className="code-2 text-text-muted">name</dt><dd className="body-6 text-text">Anna Kowalski</dd>
            <dt className="code-2 text-text-muted">email</dt><dd className="break-all code-2 text-text">anna@example.com</dd>
            <dt className="code-2 text-text-muted">message</dt><dd className="body-6 text-text">Hi, can I book a cleaning for next Tuesday? Mornings are best.</dd>
          </dl>
          <div className="flex flex-col gap-2">
            <p className="label-mono text-text-subtle">Delivery timeline</p>
            <Timeline
              steps={[
                { name: "Received", time: "14:02:03" },
                { name: "Sorted", time: "14:02:04", detail: "Spam score 0.04" },
                { name: "Dispatched", time: "14:02:04" },
                { name: "Deferred", time: "14:02:05", detail: "Recipient server asked to retry (450)", state: "deferred" },
                { name: "Accepted", time: "14:02:07", detail: "Accepted by the recipient's mail server" },
              ]}
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-0 border-t border-text lg:col-span-5">
          <div className="flex flex-col gap-4 border-b border-border py-6">
            <p className="flex items-baseline justify-between gap-2"><span className="title-3 text-text">Usage this month</span><span className="code-2 text-text-muted">NOV 2026</span></p>
            <div role="img" aria-label="214 of 250 legitimate submissions used, 9 spam, 3 held" className="flex h-2 overflow-hidden rounded-sm bg-surface-sunken">
              <span style={{ width: "68%" }} className="h-full bg-text" />
              <span style={{ width: "5%" }} className="h-full bg-warning" />
              <span style={{ width: "3%" }} className="h-full bg-border-strong" />
            </div>
            <p className="body-6 text-text-subtle"><span className="title-4 text-text">214</span> of 250 delivered, 9 spam not counted, 3 held</p>
            <p className="caption-5 text-text-subtle">Illustration with fictional data. Over the limit, legitimate submissions are held and shown, then released when you upgrade or the month resets.</p>
          </div>
          <div className="flex flex-col gap-4 border-b border-border py-6">
            <p className="title-3 text-text">Spam never costs you a submission</p>
            <p className="body-6 text-text-subtle">Quarantined rows list the signals that caught them, such as honeypot filled or 7 links, with a Not spam button if we got it wrong.</p>
            <div className="flex flex-wrap gap-2"><StatusChip status="Spam blocked" /><StatusChip status="Held over limit" /></div>
          </div>
        </div>
      </div>
    </Section>
  );
}
