import { plans, product as p } from "@/config/product";
import type { DocPage } from "./types";

const n = (x: number) => new Intl.NumberFormat("en").format(x);
const rows = plans.map((pl) => `${pl.name}: ${n(pl.limits.submissions)} submissions a month, ${pl.limits.recipients} recipient${pl.limits.recipients === 1 ? "" : "s"}, ${pl.limits.seats} seat${pl.limits.seats === 1 ? "" : "s"}, ${pl.limits.integrations} webhook endpoint${pl.limits.integrations === 1 ? "" : "s"}, history kept ${pl.retentionDays} days.`);

export const limits: DocPage = {
  slug: "limits",
  title: "Limits and retention",
  description: `Plan limits, what counts toward them, request limits and how long ${p.name} keeps data.`,
  sections: [
    {
      heading: "Plan limits",
      body: [...rows, "Prices and the full comparison are on the pricing page."],
    },
    {
      heading: "What counts",
      body: [
        "One legitimate submission counts once, when it passes the spam check. Spam, test submissions and honeypot hits never count. Usage resets at the start of each UTC calendar month. The Usage page shows the current month against your limit and the last 12 months.",
      ],
    },
    {
      heading: "Over the limit",
      body: [
        "Past your plan's limit, submissions are held, not rejected and not deleted. You get a notice at 80% and at 100%. Held submissions are released, oldest first, when you upgrade or the month resets. Held submissions are not emailed until then.",
      ],
    },
    {
      heading: "Request limits",
      body: [
        "Endpoint posts: 100 KB per request, 25 fields, 20,000 characters per value, 5 posts a minute per visitor and 120 a minute per form. API requests need a key and are rate limited per key.",
      ],
    },
    {
      heading: "Retention",
      body: [
        "Submissions are deleted after your plan's history period, counted from when they arrived. A daily job does it and writes an audit entry. Held submissions are kept while held. You can also delete all submissions of a form, export to CSV at any time, and delete your workspace to remove everything. Delivery receipts are kept for 90 days.",
      ],
    },
  ],
};
