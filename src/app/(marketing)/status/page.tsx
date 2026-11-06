import { Container } from "@/components/ui/layout";
import { product } from "@/config/product";
import { pageMetadata } from "@/lib/seo";
import { loadStatus, type StatusSummary } from "@/lib/status";

export const metadata = pageMetadata({
  title: "Status",
  description: `Uptime of ${product.name}, from a probe that checks the database and the public endpoints every few minutes and a daily end to end check.`,
  path: "/status",
});

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });

const HEADLINE: Record<StatusSummary["current"], { text: string; dot: string }> = {
  up: { text: "All systems operational", dot: "bg-success" },
  down: { text: "We are seeing a problem", dot: "bg-danger" },
  unknown: { text: "No checks recorded yet", dot: "bg-text-muted" },
};

export default async function StatusPage() {
  let s: StatusSummary | null = null;
  try {
    s = await loadStatus();
  } catch {
    s = null;
  }
  const head = s ? HEADLINE[s.current] : { text: "We cannot read our own status right now", dot: "bg-danger" };
  return (
    <Container className="py-12 md:py-20">
      <header className="mb-10 flex max-w-3xl flex-col gap-3">
        <h1 className="heading-4 text-text">Status</h1>
        <p className="body-3 text-text-subtle">Checked by our own probe: the database and the public endpoints every few minutes, plus a daily end to end check.</p>
      </header>
      <section aria-labelledby="now" className="flex max-w-3xl flex-col gap-6">
        <h2 id="now" className="sr-only">Current status</h2>
        <p role="status" className="title-2 flex items-center gap-3 text-text">
          <span aria-hidden className={`inline-block size-3 rounded-full ${head.dot}`} />
          {head.text}
        </p>
        {s && s.total > 0 && (
          <dl className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-surface p-4">
              <dt className="caption-3 text-text-subtle">Uptime, last 90 days</dt>
              <dd className="title-2 text-text">{s.uptimePct}%</dd>
            </div>
            <div className="rounded-md border border-border bg-surface p-4">
              <dt className="caption-3 text-text-subtle">Average response</dt>
              <dd className="title-2 text-text">{s.avgMs ?? "n/a"} ms</dd>
            </div>
            <div className="rounded-md border border-border bg-surface p-4">
              <dt className="caption-3 text-text-subtle">Last daily check</dt>
              <dd className="title-2 text-text">{s.lastCanary ? `${s.lastCanary.ok ? "Passed" : "Failed"}` : "n/a"}</dd>
              {s.lastCanary && <dd className="caption-4 text-text-muted">{fmt.format(s.lastCanary.at)} UTC</dd>}
            </div>
          </dl>
        )}
        {s && s.lastAt && <p className="body-6 text-text-subtle">Last check {fmt.format(s.lastAt)} UTC.</p>}
      </section>
      {s && (
        <section aria-labelledby="days" className="mt-12 flex flex-col gap-3">
          <h2 id="days" className="title-2 text-text">Last 90 days</h2>
          <ul className="flex gap-0.5" aria-label="Daily status, oldest first">
            {s.days.map((d) => {
              const label = d.checks === 0 ? "no checks" : d.failed === 0 ? "operational" : `${d.failed} of ${d.checks} checks failed`;
              const tone = d.checks === 0 ? "bg-surface-sunken" : d.failed === 0 ? "bg-success" : "bg-danger";
              return <li key={d.date} title={`${d.date}: ${label}`} className={`h-8 min-w-0 flex-1 rounded-sm ${tone}`}><span className="sr-only">{d.date}: {label}</span></li>;
            })}
          </ul>
          <p className="caption-4 text-text-muted">Green is a day with every check passing, red a day with at least one failed check, grey a day without checks.</p>
        </section>
      )}
    </Container>
  );
}
