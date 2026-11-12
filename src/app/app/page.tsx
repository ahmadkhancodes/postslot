import { DownloadSimple, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { Meter } from "@/components/app/meter";
import { CreateForm } from "@/components/app/forms/create-form";
import { checklist } from "@/lib/onboarding/checklist";
import { PageHeader } from "@/components/app/page-header";
import { BulkActions } from "@/components/app/inbox/bulk-actions";
import { InboxShortcuts } from "@/components/app/inbox/shortcuts";
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
import type { Form, Recipient, Submission } from "@/lib/forms/types";
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
  const beforeRaw = one(sp.before);
  const before = beforeRaw && !Number.isNaN(Date.parse(beforeRaw)) ? new Date(beforeRaw) : undefined;
  const PAGE = 50;
  const [forms, recipients, rows, counts, usage] = await Promise.all([
    db.docs<Form>("forms").find({ orgId: ctx.org.id }, { sort: { createdAt: -1 }, limit: 200 }),
    db.docs<Recipient>("recipients").find({ orgId: ctx.org.id }),
    listSubmissions(db, ctx.org.id, { filter, q, formId, before, limit: PAGE + 1 }),
    filterCounts(db, ctx.org.id, formId),
    currentUsage(db, ctx.org.id, ["submissions"]),
  ]);
  const hasMore = rows.length > PAGE;
  if (hasMore) rows.length = PAGE;
  const [testCount, realCount] = await Promise.all([
    db.docs<Submission>("submissions").count({ orgId: ctx.org.id, isTest: true }),
    db.docs<Submission>("submissions").count({ orgId: ctx.org.id, isTest: false }),
  ]);
  const setup = checklist({ forms: forms.length, confirmedRecipient: recipients.some((r) => r.verifiedAt), testSubmissions: testCount, realSubmissions: realCount, firstFormId: forms[forms.length - 1]?._id });
  const detail = selected ? await getDetail(db, ctx.org.id, selected) : null;
  const canWrite = can(ctx.role, "data", "write");
  const bounced = recipients.filter((r) => r.bouncedAt);
  const unconfirmed = recipients.filter((r) => !r.verifiedAt);

  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string | undefined> = { filter: filter === "all" ? undefined : filter, q: q || undefined, form: formId, before: before?.toISOString(), ...over };
    for (const [k, v] of Object.entries(cur)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/app?${s}` : "/app";
  };
  const exportQs = new URLSearchParams({ ...(formId ? { form: formId } : {}), ...(filter !== "all" ? { filter } : {}), ...(q ? { q } : {}) }).toString();

  if (!forms.length)
    return (
      <>
        <PageHeader title="Inbox" description="Every submission, with the receipt that shows where it went." />
        {can(ctx.role, "data", "write") ? (
          <section aria-label="Create your first form" className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <h2 className="title-3 text-text">Create your first form</h2>
              <p className="body-6 text-text-subtle">A form is one endpoint URL. Create it, send yourself a test, then point your site&apos;s form at it. Mail goes to {ctx.user.email}, already confirmed.</p>
            </div>
            <CreateForm defaultName="Contact form" label="Form name" />
          </section>
        ) : (
          <EmptyState
            title="No forms yet"
            body="An owner or admin of this organization creates forms. Submissions show up here with a delivery receipt."
          />
        )}
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
        {!setup.complete ? (
          <section aria-label="Get started" className="rounded border border-border bg-surface p-4">
            <h2 className="title-4 text-text">Get to your first lead <span className="font-mono text-xs text-text-muted">{setup.done}/{setup.steps.length}</span></h2>
            <ol className="mt-3 grid gap-2 sm:grid-cols-2">
              {setup.steps.map((st) => (
                <li key={st.id}>
                  <Link href={st.href} className="flex min-h-11 items-start gap-3 rounded px-2 py-2 hover:bg-surface-raised focus-visible:focus-ring">
                    <span aria-hidden className={cn("mt-1 inline-flex size-6 shrink-0 items-center justify-center rounded-full border text-xs", st.done ? "border-accent bg-accent text-white" : "border-border text-text-muted")}>{st.done ? "✓" : ""}</span>
                    <span className="flex flex-col"><span className={cn("body-5", st.done ? "text-text-subtle line-through" : "text-text")}>{st.title}<span className="sr-only">{st.done ? " (done)" : " (to do)"}</span></span><span className="caption-2 text-text-subtle">{st.hint}</span></span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
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
            href={href({ filter: f === "all" ? undefined : f, id: undefined, before: undefined })}
            aria-current={f === filter ? "page" : undefined}
            className={cn("relative inline-flex min-h-11 min-w-11 items-center justify-center gap-2 whitespace-nowrap px-2 body-5 transition-colors duration-300 focus-visible:focus-ring", f === filter ? "text-text after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-accent" : "text-text-subtle hover:text-text")}
          >
            {FILTER_LABEL[f]} <span className="font-mono text-xs text-text-muted">{counts[f]}</span>
          </Link>
        ))}
      </nav>

      <InboxShortcuts hrefs={rows.map((r) => ({ id: r._id, href: href({ id: r._id }) }))} selected={selected} listHref={href({ id: undefined })} />
      <p className="-mt-3 caption-2 text-text-subtle max-lg:hidden">Shortcuts: <kbd className="font-mono">j</kbd> / <kbd className="font-mono">k</kbd> next and previous, <kbd className="font-mono">/</kbd> search, <kbd className="font-mono">Esc</kbd> close.</p>
      <div className="grid gap-6 lg:grid-cols-12">
        <section aria-label="Submissions" className={cn("flex flex-col lg:col-span-5", detail ? "hidden lg:flex" : "")}>
          {canWrite && filter === "spam" && rows.length > 1 ? (
            <div className="mb-3"><BulkActions ids={rows.map((r) => r._id)} mode="spam" /></div>
          ) : null}
          {rows.length ? (
            <>
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
            <nav aria-label="Pages" className="mt-3 flex items-center justify-between gap-3 caption-2 text-text-subtle">
              {before ? <Link href={href({ before: undefined, id: undefined })} className={buttonClass("tertiary", "md")}>Newest</Link> : <span>{rows.length} newest shown</span>}
              {hasMore ? <Link rel="next" href={href({ before: rows[rows.length - 1]!.receivedAt.toISOString(), id: undefined })} className={buttonClass("secondary", "md")}>Older submissions</Link> : null}
            </nav>
            </>
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
