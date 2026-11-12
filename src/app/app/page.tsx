import { DownloadSimple, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Meter } from "@/components/app/meter";
import { PageHeader } from "@/components/app/page-header";
import { SubmissionDetail } from "@/components/app/inbox/submission-detail";
import { chipFor, previewOf, senderOf, shortWhen } from "@/components/app/inbox/status";
import { StatusChip } from "@/components/marketing/demo/receipt";
import { buttonClass } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Input, Select } from "@/components/ui/field";
import { Badge, EmptyState, Notice } from "@/components/ui/states";
import { can } from "@/lib/auth/roles";
import { requireOrg } from "@/lib/auth/session";
import { currentUsage } from "@/lib/billing/usage";
import { getDb } from "@/lib/db";
import type { Form, Recipient } from "@/lib/forms/types";
import { FILTER_LABEL, INBOX_FILTERS, filterCounts, getDetail, listSubmissions, parseFilter } from "@/lib/inbox/query";

export const metadata = { title: "Inbox" };
export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function InboxPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const ctx = await requireOrg({ page: true });
  const db = await getDb();
  const filter = parseFilter(one(sp.filter));
  const q = one(sp.q)?.slice(0, 100) ?? "";
  const formId = one(sp.form) || undefined;
  const selected = one(sp.id);
  const [forms, recipients, rows, counts, usage] = await Promise.all([
    db.docs<Form>("forms").find({ orgId: ctx.org.id }, { sort: { createdAt: -1 }, limit: 200 }),
    db.docs<Recipient>("recipients").find({ orgId: ctx.org.id }),
    listSubmissions(db, ctx.org.id, { filter, q, formId, limit: 50 }),
    filterCounts(db, ctx.org.id, formId),
    currentUsage(db, ctx.org.id, ["submissions"]),
  ]);
  const detail = selected ? await getDetail(db, ctx.org.id, selected) : null;
  const canWrite = can(ctx.role, "data", "write");
  const bounced = recipients.filter((r) => r.bouncedAt);
  const unconfirmed = recipients.filter((r) => !r.verifiedAt);

  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = { filter: filter === "all" ? undefined : filter, q: q || undefined, form: formId, ...over };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/app?${s}` : "/app";
  };
  const exportQs = new URLSearchParams({ ...(formId ? { form: formId } : {}), ...(filter !== "all" ? { filter } : {}), ...(q ? { q } : {}) }).toString();

  if (!forms.length)
    return (
      <>
        <PageHeader title="Inbox" description="Every submission, with the receipt that shows where it went." />
        <EmptyState
          title="Create your first form"
          body="A form is one endpoint URL. Point your HTML form at it, confirm your email address, and submissions show up here with a delivery receipt."
          action={<Link href="/app/forms" className={buttonClass("primary")}>Create a form</Link>}
        />
      </>
    );

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Every submission, with the receipt that shows where it went."
        actions={
          <>
            <a href={`/api/submissions/export${exportQs ? `?${exportQs}` : ""}`} className={buttonClass("secondary", "md")}><DownloadSimple size={20} aria-hidden /> Export CSV</a>
          </>
        }
      />
      <div className="flex flex-col gap-3">
        {bounced.map((r) => (
          <Notice key={r._id} tone="danger" title={`We couldn't deliver to ${r.email}`} action={<Link href="/app/forms" className={buttonClass("secondary", "sm")}>Fix it</Link>}>
            {r.bounceDetail ?? "The address was rejected."} Fix the address or confirm it exists, then press Redeliver on a submission.
          </Notice>
        ))}
        {unconfirmed.length ? (
          <Notice tone="warning" title="Confirm your recipient address">
            We emailed a link to {unconfirmed.map((r) => r.email).join(", ")}. Submissions wait here until it is confirmed; nothing is sent to an unconfirmed address.
          </Notice>
        ) : null}
        {usage[0] ? <div className="max-w-md"><Meter state={usage[0]} /></div> : null}
      </div>

      <form method="get" action="/app" role="search" className="grid grid-cols-[1fr_auto] gap-3 sm:flex sm:items-center">
        {filter !== "all" ? <input type="hidden" name="filter" value={filter} /> : null}
        <div className="relative col-span-2 min-w-0 flex-1">
          <MagnifyingGlass size={18} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <Input name="q" defaultValue={q} placeholder="Search words in names, emails and messages" aria-label="Search submissions" className="pl-10" />
        </div>
        <div className="sm:w-2xs sm:shrink-0">
          <Select name="form" defaultValue={formId ?? ""} aria-label="Form">
            <option value="">All forms</option>
            {forms.map((f) => <option key={f._id} value={f._id}>{f.name}</option>)}
          </Select>
        </div>
        <button type="submit" className={buttonClass("secondary", "md")}>Search</button>
      </form>
      <p className="-mt-3 caption-2 text-text-subtle">Search matches whole words, so “jam” will not find “jamie”. <span className="max-sm:hidden">Use several words to match any of them, “quotes” for an exact phrase and a leading minus to leave a word out.</span></p>

      <nav aria-label="Filter" className="flex gap-2 overflow-x-auto border-b border-border">
        {INBOX_FILTERS.map((f) => (
          <Link
            key={f}
            href={href({ filter: f === "all" ? undefined : f, id: undefined })}
            aria-current={f === filter ? "page" : undefined}
            className={cn("relative inline-flex min-h-11 min-w-11 items-center justify-center gap-2 whitespace-nowrap px-2 body-5 transition-colors duration-300 focus-visible:focus-ring", f === filter ? "text-text after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent" : "text-text-subtle hover:text-text")}
          >
            {FILTER_LABEL[f]} <span className="font-mono text-xs text-text-muted">{counts[f]}</span>
          </Link>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-12">
        <section aria-label="Submissions" className={cn("flex flex-col lg:col-span-5", detail ? "hidden lg:flex" : "")}>
          {rows.length ? (
            <ul className="flex flex-col overflow-hidden rounded border border-border bg-surface">
              {rows.map((s) => (
                <li key={s._id} className="border-b border-border last:border-b-0">
                  <Link
                    href={href({ id: s._id })}
                    aria-current={s._id === selected ? "true" : undefined}
                    className={cn("relative flex min-h-11 flex-col gap-1 px-4 py-3 transition-colors duration-300 hover:bg-surface-raised focus-visible:focus-ring", s._id === selected && "bg-accent-surface hover:bg-accent-surface")}
                  >
                    {s._id === selected ? <span aria-hidden className="absolute inset-y-0 left-0 w-0.5 bg-accent" /> : null}
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="title-4 truncate text-text">{senderOf(s)}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-text-muted">{shortWhen(s.receivedAt)}</span>
                    </span>
                    <span className="caption-2 line-clamp-1 text-text-subtle">{previewOf(s)}</span>
                    <span className="flex flex-wrap items-center gap-3">
                      <StatusChip status={chipFor(s)} />
                      {s.isTest ? <Badge tone="info">Test submission</Badge> : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title={q ? "No submissions match your search" : filter === "spam" ? "No spam caught" : "No submissions yet"}
              body={q ? "Try fewer words or switch the filter to All." : "Submit your form once to see it here with its receipt. The install snippet is on the form's page."}
              action={<Link href="/app/forms" className={buttonClass("secondary")}>Open forms</Link>}
            />
          )}
        </section>
        <div className={cn("flex flex-col gap-3 lg:col-span-7", detail ? "" : "hidden lg:flex")}>
          {detail ? (
            <>
              <Link href={href({ id: undefined })} className={cn(buttonClass("tertiary", "md", "self-start"), "lg:hidden")}>Back to inbox</Link>
              <SubmissionDetail d={detail} canWrite={canWrite} />
            </>
          ) : (
            <div className="hidden flex-col gap-4 rounded border border-dashed border-border-receipt bg-surface p-8 lg:flex">
              <p className="label-mono text-text-muted">Delivery receipt</p>
              <p className="body-6 text-text-subtle">Select a submission to see its message, spam signals and delivery receipt.</p>
              <div aria-hidden className="tear-line" />
              <p aria-hidden className="font-mono text-xs leading-6 text-text-muted">14:02:03 Received<br />14:02:04 Sorted<br />14:02:04 Dispatched<br />14:02:07 Accepted</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
