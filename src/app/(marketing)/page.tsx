import type { Metadata } from "next";
import Link from "next/link";
import { Section } from "@/components/ui/layout";
import { ButtonLink } from "@/components/ui/button";
import {
  CompareTable, Faq, Features, FinalCta, Hero, HowItWorks, InboxExplainer, PricingTable, Problem, StatStrip, TaglineReveal,
  type FaqItem, type Feature, type ProblemItem, type Step,
} from "@/components/marketing";
import { InboxPreview } from "@/components/marketing/demo/inbox-preview";
import { Postmark } from "@/components/marketing/demo/postmark";
import { StatusChip, Timeline } from "@/components/marketing/demo/receipt";
import { InstallSnippet } from "@/components/marketing/install-snippet";
import { freePlan, planById, product } from "@/config/product";

const title = "Postslot by BufferSol: form backend with delivery receipts";
const description = "Point any HTML form at Postslot by BufferSol. Spam is filtered, mail is delivered and every submission gets a delivery receipt. Free for 250 a month.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { title, description, url: "/" },
};

const dollars = (cents: number) => `$${cents / 100}`;
const pro = planById("pro")!;
const proYear = pro.prices.find((p) => p.interval === "year")!.usd;

const problems: ProblemItem[] = [
  { pain: "Submit button does nothing.", detail: "A form that fails quietly leaves nothing to inspect. A receipt per submission shows what arrived and when." },
  { pain: "The email landed in spam, or never left.", detail: "The receipt shows whether the recipient's mail server accepted the message or asked us to retry." },
  { pain: "A bot sent 400 messages overnight.", detail: "Bots are sorted out before they count. Spam never uses up your monthly submissions." },
];

const steps: Step[] = [
  {
    title: "Paste your endpoint",
    body: "Set the form action to your Postslot URL and keep method POST. It works on static sites and on code from AI builders.",
    visual: <InstallSnippet />,
  },
  {
    title: "Press Send test",
    body: "The field linter checks your markup before a visitor does, for example an input with no name attribute.",
    visual: (
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
        <div className="flex flex-wrap items-center gap-4">
          <ButtonLink href="/sign-in" size="md">Send test submission</ButtonLink>
        </div>
        <p role="note" className="body-6 rounded-sm border border-warning bg-warning-surface p-3 text-text">
          Input <span className="font-mono text-xs">email</span> has no name attribute, so its value will not be sent.
        </p>
        <p className="caption-5 text-text-subtle">Sample data.</p>
      </div>
    ),
  },
  {
    title: "Watch the stamp land",
    body: "The receipt fills in as the message is received, sorted, dispatched and accepted. Your first stamp appears in a few seconds.",
    visual: (
      <div className="flex items-center justify-between gap-6 rounded-lg border border-border bg-surface p-6">
        <Timeline
          steps={[
            { name: "Received", time: "14:02:03" },
            { name: "Sorted", time: "14:02:04" },
            { name: "Dispatched", time: "14:02:04" },
            { name: "Accepted", time: "14:02:07" },
          ]}
        />
        <Postmark time="14:02:07" date="05 NOV 2026" className="size-24 shrink-0" />
      </div>
    ),
  },
];

const features: Feature[] = [
  {
    title: "Prove delivery, per submission",
    body: "Each submission has a timeline: received, sorted, dispatched, accepted by the recipient's mail server, with timestamps.",
    span: 4,
    visual: (
      <div className="p-4">
        <Timeline
          steps={[
            { name: "Dispatched", time: "09:14:10" },
            { name: "Deferred", time: "09:14:11", detail: "Recipient server asked to retry (450)", state: "deferred" },
            { name: "Accepted", time: "09:14:19", detail: "Accepted by the recipient's mail server" },
          ]}
        />
        <p className="caption-5 mt-3 text-text-subtle">Sample data.</p>
      </div>
    ),
  },
  {
    title: "Spam never costs you a submission",
    body: "Honeypot, signed time token, self hosted ALTCHA proof of work, rate limits, domain lock and a rules engine. Real visitors see no puzzle.",
    span: 2,
    visual: (
      <div className="flex flex-col gap-2 p-4">
        <StatusChip status="Spam blocked" />
        <p className="font-mono text-xs text-text-subtle">honeypot filled · 7 links</p>
      </div>
    ),
  },
  {
    title: "Busy month, nothing dropped",
    body: "Over the limit, legitimate submissions are held and shown in your inbox, then released when you upgrade or the month resets.",
    span: 3,
    visual: (
      <div className="flex flex-col gap-2 p-4">
        <StatusChip status="Held over limit" />
        <p className="caption-5 text-text-subtle">214 of 250 delivered, 9 spam not counted, 3 held. Sample data.</p>
      </div>
    ),
  },
  {
    title: "One line to install, every stack",
    body: "Snippets for HTML, React, Next.js, Astro, Vue, Svelte, Webflow, Framer and WordPress, with your key already filled in.",
    span: 3,
    visual: <p className="break-all p-4 font-mono text-xs text-text-subtle">{`https://${product.host}/f/<form_key>`}</p>,
  },
  {
    title: "Also included",
    body: `90 day history on the Free plan, CSV and JSON export on every plan, a custom sending domain on Pro and ${freePlan.limits.submissions} submissions a month for free.`,
    span: 6,
  },
];

const compareRows = [
  { label: "Free submissions a month", values: ["250", "250", "50"] },
  { label: "Pro price", values: [`${dollars(proYear)} a year`, "$149 a year", "Professional, $30 a month"] },
  { label: "Submissions at that price", values: ["10,000 a month", "10,000 a month", "2,000 a month"] },
  { label: "Spam counts toward quota", values: ["No", "{{verify}}", "{{verify}}"] },
  { label: "At the limit", values: ["Held, not dropped", "Rejected", "{{verify}}"] },
  { label: "Delivery log per submission", values: [true, false, "{{verify}}"] },
  { label: "Free history", values: ["90 days", "30 days", "{{verify}}"] },
];

const faq: FaqItem[] = [
  { q: "Web3Forms free already works. Why switch?", a: "It does, and moving is one action URL. Switch if you want a delivery log per submission, 90 days of history on Free instead of 30, and held submissions instead of rejected ones at the limit." },
  { q: "Will the emails land in spam?", a: "We cannot promise inbox placement for any sender. The receipt shows whether the recipient's server accepted a message or deferred it, so you see problems the day they happen." },
  { q: "Is it safe to paste the form key in my HTML?", a: "Yes. The key is public by design, like a form action URL. Lock it to your domain in the form's allowed domains and it only accepts submissions from there." },
  { q: "What counts toward my limit?", a: "Delivered legitimate submissions. Spam and test submissions do not count." },
  { q: "What happens when I go over the limit?", a: "We keep accepting. Extra submissions are held in your inbox and released when you upgrade or the month resets. You get a notice at 80% and 100%." },
  { q: "Will my AI builder understand this?", a: "Yes. There are copy paste prompts for Lovable, Bolt, v0 and Claude Code with your key filled in, and llms.txt docs. AI builders often generate a handler that only logs to the console; the prompt replaces it." },
  { q: "Do real visitors get a captcha?", a: "No puzzle. Our proof of work check runs invisibly and is hosted by us; no request leaves our infrastructure." },
  { q: "What if Postslot goes down?", a: "Ingest is built to keep accepting submissions and replay them. We publish uptime only once we have measured it." },
  { q: "Do you offer a DPA, SOC 2 or HIPAA?", a: "A DPA is on every plan. We do not offer SOC 2, SSO or HIPAA forms." },
  { q: "How hard is moving from Web3Forms or Formspree?", a: "Change one action URL and the hidden field names if you used custom ones. The compare pages list the differences." },
];

export default function HomePage() {
  const stats = [
    { value: String(freePlan.limits.submissions), label: "submissions a month on Free, spam not counted" },
    { value: "90 days", label: "of history on the Free plan" },
    { value: "0 dropped", label: "over the limit, submissions are held, not rejected" },
    { value: "1 line", label: "to install: change the form action" },
  ];
  return (
    <>
      <Hero
        title={<>Every form submission delivered<br />with the receipt to prove it</>}
        subtitle="Point any HTML form at Postslot by BufferSol. We filter the spam, deliver to your inbox and stamp every message with its delivery status. Free for 250 submissions a month."
        primaryCta={{ href: "/sign-in", label: "Create a form" }}
        secondaryCta={{ href: "/docs", label: "Read the docs" }}
        proof={
          <>
            <p>Free plan, no card. Spam never counts toward your limit.</p>
            <p className="mt-2">
              <span className="text-text">Pro is {dollars(proYear)} a year for 10,000 submissions a month.</span> Web3Forms Pro is $149 a year for the same 10,000 (checked 3 Nov 2026, not affiliated).{" "}
              <Link href="/compare/web3forms" className="text-action underline underline-offset-4 hover:text-action-hover focus-visible:focus-ring">See the comparison</Link>
            </p>
          </>
        }
        visual={<InboxPreview />}
      />
      <StatStrip stats={stats} />
      <InboxExplainer />
      <Problem
        title="Your client says the form never works. You cannot prove otherwise."
        intro="Postslot gives every submission a receipt: received, sorted, dispatched, accepted. When a client asks, you open the letter and show the time."
        items={problems}
      />
      <Features title="What the receipt covers" items={features} />
      <HowItWorks title="Three steps from form to first stamp" steps={steps} />
      <TaglineReveal text="A form that sends is not enough. You need to know it arrived. Postslot stamps every submission, so nothing disappears quietly." />
      <Section tone="raised" labelledBy="compare-title">
        <div className="flex max-w-2xl flex-col gap-4">
          <h2 id="compare-title" className="heading-4 md:heading-2 text-text">Same endpoint idea, half the price, plus a receipt</h2>
        </div>
        <div className="mt-12">
          <CompareTable caption="Postslot, Web3Forms and Formspree compared" columns={["Postslot", "Web3Forms", "Formspree"]} highlightColumn={0} rows={compareRows} />
        </div>
        <p className="caption-2 mt-4 max-w-2xl text-text-subtle">
          Checked 3 Nov 2026 from public pricing pages. Not affiliated with Web3Forms or Formspree. Cells marked {"{{verify}}"} are not confirmed yet.{" "}
          <Link href="/compare/web3forms" className="text-action underline underline-offset-4 hover:text-action-hover focus-visible:focus-ring">Full Web3Forms comparison</Link>
        </p>
      </Section>
      <Section labelledBy="pricing-title">
        <PricingTable title="Half the price. None of the guesswork." />
        <p className="body-6 mt-6 max-w-2xl text-text-subtle">
          Pro: 10,000 submissions a month for {dollars(proYear)} a year or $7.49 a month. Web3Forms (web3forms.com) Pro is $149 a year or $15 a month for the same 10,000 (checked 3 Nov 2026).
        </p>
      </Section>
      <Faq items={faq} />
      <Section tone="raised" labelledBy="risk-title">
        <div className="flex flex-col gap-2">
          <h2 id="risk-title" className="heading-5 text-text">Start on the Free plan</h2>
          <p className="body-3 text-text-subtle">No card, no trial clock. Cancel anytime, export everything.</p>
        </div>
      </Section>
      <FinalCta
        title="Send your first test and watch the stamp land"
        cta={{ href: "/sign-in", label: "Create a form" }}
        note={<Link href="/docs" className="underline underline-offset-4 focus-visible:focus-ring">Read the docs</Link>}
      />
    </>
  );
}
