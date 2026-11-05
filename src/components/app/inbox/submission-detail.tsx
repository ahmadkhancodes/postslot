import { Postmark } from "@/components/marketing/demo/postmark";
import { StatusChip, Timeline } from "@/components/marketing/demo/receipt";
import { Badge } from "@/components/ui/states";
import { timelineOpen } from "@/lib/delivery/timeline";
import type { Detail } from "@/lib/inbox/query";
import { AutoRefresh } from "./auto-refresh";
import { DetailActions } from "./detail-actions";
import { chipFor, clock, dayStamp, senderOf } from "./status";

const WORDS: Record<string, string> = {
  honeypot: "A hidden field was filled in", too_fast: "Sent faster than a person can type", stale_token: "Page was open for more than a day",
  bad_token: "Time token was not valid", links: "Too many links", blocked_phrase: "Contains a blocked phrase", script_tag: "Contains code markup",
  disposable_email: "Throwaway email domain", bayes: "Looks like messages you marked as spam", allowed_sender: "Sender was marked not spam before",
};

/** The approved mock's right pane: message, spam signals, delivery receipt with the postmark, recipients. */
export function SubmissionDetail({ d, canWrite }: { d: Detail; canWrite: boolean }) {
  const { submission: s, steps, deliveries } = d;
  const accepted = [...steps].reverse().find((x) => x.type === "accepted");
  const open = timelineOpen(steps);
  const signals = s.signals.filter((x) => x.weight > 0 || x.name === "allowed_sender");
  return (
    <article aria-labelledby="sub-h" className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-5 sm:p-6">
      <AutoRefresh active={open} />
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 id="sub-h" className="heading-6 break-words text-text">{senderOf(s)}</h2>
            <p className="caption-2 text-text-subtle">
              {s.replyTo ? <>{s.replyTo} · </> : null}to {d.form?.name ?? "deleted form"} · <time dateTime={s.receivedAt.toISOString()}>{dayStamp(s.receivedAt)} {clock(s.receivedAt)} UTC</time>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={chipFor(s)} />
            {s.isTest ? <Badge tone="info">Test submission, not counted</Badge> : null}
          </div>
        </div>
        <DetailActions id={s._id} status={s.status} canWrite={canWrite} />
      </header>

      <dl className="flex flex-col gap-4">
        {s.subject ? <div><dt className="caption-4 text-text-muted">Subject</dt><dd className="body-6 text-text">{s.subject}</dd></div> : null}
        {Object.entries(s.fields).map(([k, v]) => (
          <div key={k}>
            <dt className="caption-4 text-text-muted">{k}</dt>
            <dd className="body-6 whitespace-pre-wrap break-words text-text">{v}</dd>
          </div>
        ))}
      </dl>

      {signals.length ? (
        <section aria-labelledby="sig-h" className="flex flex-col gap-2 rounded-md border border-border bg-surface-raised p-4">
          <h3 id="sig-h" className="title-4 text-text">Spam signals <span className="font-mono text-xs text-text-muted">score {s.spamScore.toFixed(2)}{s.scored ? "" : ", unscored"}</span></h3>
          <ul className="flex flex-col gap-1">
            {signals.map((x, i) => (
              <li key={`${x.name}-${i}`} className="caption-2 text-text-subtle">
                <span className="font-mono text-text">{x.name}</span> {x.weight > 0 ? <span className="font-mono text-text-muted">+{x.weight.toFixed(2)}</span> : null}: {WORDS[x.name] ?? x.name}{x.detail ? ` (${x.detail})` : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="rcpt-h" className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <h3 id="rcpt-h" className="title-3 text-text">Delivery receipt</h3>
          {accepted ? <Postmark label="DELIVERED" time={clock(accepted.at)} date={dayStamp(accepted.at)} className="size-24 shrink-0 -rotate-6" /> : null}
        </div>
        <Timeline steps={steps.map((x) => ({ name: x.label, time: clock(x.at), detail: x.detail, state: x.tone === "warn" ? "deferred" : "done" }))} />
        {open ? <p className="caption-2 text-text-subtle">Waiting for the recipient&apos;s mail server. This page updates by itself.</p> : null}
        {deliveries.length ? (
          <ul className="flex flex-col gap-1 border-t border-border pt-3">
            {deliveries.map((x) => (
              <li key={x._id} className="caption-2 flex flex-wrap justify-between gap-2 text-text-subtle">
                <span className="break-all">{x.recipientEmail}</span>
                <span className="font-mono text-text-muted">{x.status}{x.attempts > 1 ? `, ${x.attempts} attempts` : ""}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </article>
  );
}
