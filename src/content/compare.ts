import { planById, product } from "@/config/product";
import type { CompareValue } from "@/components/marketing/compare-table";

export interface CompareEntry {
  slug: string;
  competitor: string;
  title: string;
  description: string;
  headline: string;
  intro: string;
  rows: { label: string; values: [CompareValue, CompareValue] }[];
  /** Things we have not confirmed stay as {{verify}} until checked against the competitor's own pages. */
  fitNote: string;
  /** Date the competitor facts were checked, and where. */
  checked: string;
  source: { label: string; url: string };
  migration: string[];
  faq: { q: string; a: string }[];
}

const dollars = (cents: number) => `$${Number.isInteger(cents / 100) ? cents / 100 : (cents / 100).toFixed(2)}`;
const priceOf = (plan: string, interval: "month" | "year") => planById(plan)?.prices.find((p) => p.interval === interval)?.usd ?? 0;
const proYear = priceOf("pro", "year");
const proMonth = priceOf("pro", "month");
const agencyYear = priceOf("agency", "year");
const agencyMonth = priceOf("agency", "month");

/** Compare-page template data: add an entry and /compare/<slug> exists. Facts only; mark the rest {{verify}}. */
export const comparisons: CompareEntry[] = [
  {
    slug: "web3forms",
    competitor: "Web3Forms",
    title: `${product.name} vs Web3Forms`,
    description: `${product.name} and Web3Forms compared on free quota, paid price, delivery log, spam handling and what happens over the limit.`,
    headline: `${product.name} vs Web3Forms`,
    intro: `Both give a static site a form endpoint. The difference is what you can see after a visitor presses send: ${product.name} keeps a delivery receipt for every submission.`,
    rows: [
      { label: "Free plan submissions per month", values: ["250", "250"] },
      { label: "Free plan history", values: ["30 days", "90 days"] },
      { label: "Entry paid plan", values: ["Starter, $49 a year, by application, 5,000 a month", `Starter, ${dollars(priceOf("starter", "year"))} a year, self serve, 5,000 a month`] },
      { label: "Paid plan with 10,000 submissions a month", values: ["Pro, $149 a year or $15 a month", `Pro, ${dollars(proYear)} a year or ${dollars(proMonth)} a month`] },
      { label: "Paid plan with 20,000 submissions a month", values: ["Agency and Team, $399 a year or $39 a month", `Agency, ${dollars(agencyYear)} a year or ${dollars(agencyMonth)} a month`] },
      { label: "Delivery log with a receipt per submission", values: [false, true] },
      { label: "Spam counts toward your quota", values: ["{{verify}}", "Never"] },
      { label: "At the monthly limit", values: ["Hard cap, submissions are rejected", "Held, not dropped"] },
    ],
    fitNote: "Web3Forms is the better fit if you want the larger, longer established service with a big library of framework guides. Postslot is the better fit if you need to show a client that a specific message arrived. Cells labelled Unverified are facts we have not confirmed yet.",
    checked: "3 Nov 2026",
    source: { label: "Web3Forms pricing (web3forms.com/pricing)", url: "https://web3forms.com/pricing" },
    migration: [
      "Create a form in Postslot and copy its endpoint.",
      "Replace the Web3Forms action URL in your form with the Postslot endpoint. Keep method POST.",
      "If you used custom hidden field names, rename them to the Postslot field names listed in the docs.",
      "Press Send test submission and check the receipt.",
    ],
    faq: [
      { q: `Is ${product.name} cheaper than Web3Forms Pro?`, a: `On 3 Nov 2026 Web3Forms Pro was $149 a year. ${product.name} Pro is ${dollars(proYear)} a year, both for 10,000 submissions a month, and includes a delivery log.` },
      { q: "Do both have a free plan?", a: `Yes. Web3Forms free allows 250 submissions a month and the ${product.name} Free plan allows 250 submissions a month, with spam never counted.` },
      { q: `What happens to submissions over the ${product.name} limit?`, a: "They are held, not dropped, so you can release them after upgrading. Web3Forms rejects submissions at its cap (checked 3 Nov 2026)." },
    ],
  },
];

export const comparisonBySlug = (slug: string) => comparisons.find((c) => c.slug === slug);
export const compareEntries = comparisons;
