import { compareEntries } from "@/content/compare";
import { docs } from "@/content/docs";
import { legalDocs } from "@/content/legal";
import { product } from "@/config/product";

export const dynamic = "force-static";

export function GET() {
  const u = (path: string) => `${product.url}${path}`;
  const lines = [
    `# ${product.fullName}`,
    "",
    `> ${product.description}`,
    "",
    "## Docs",
    "",
    ...docs.map((d) => `- [${d.title}](${u(`/docs/${d.slug}`)}): ${d.description}`),
    "",
    "## Product",
    "",
    `- [Pricing](${u("/pricing")}): Free 250 submissions a month, Starter $24 a year, Pro $7.49 a month or $74 a year, Agency $19.49 a month or $199 a year. Spam never counts; over limit submissions are held, not rejected.`,
    `- Form endpoint: POST a normal HTML form (urlencoded, multipart or JSON, up to 100 KB and 25 fields) to ${u("/f/<form_key>")}. Every submission gets a delivery receipt.`,
    "- Spam never counts toward the limit. Over the limit, legitimate submissions are held in the inbox and released on upgrade or at the month reset; nothing is dropped.",
    "- Delivery receipt steps: Received, Sorted, Dispatched, then Deferred, Accepted or Returned. Accepted means the recipient's mail server took the message, not that it reached the inbox.",
    "- Email is sent through a transactional email provider. Postslot does not run its own mail servers today; a custom sending domain (SPF, DKIM, DMARC records) can be prepared and checked, and depends on a SMTP path that is not live yet.",
    "- Field names: _replyto or email sets Reply-To, _subject the subject, _redirect the success page, _gotcha is the honeypot. Inputs without a name attribute are not sent by browsers.",
    ...compareEntries.map((c) => `- [${c.title}](${u(`/compare/${c.slug}`)}): Dated comparison, checked ${c.checked}`),
    `- [Full documentation as one file](${u("/llms-full.txt")}): All docs in markdown`,
    "",
    "## Legal",
    "",
    ...legalDocs.map((d) => `- [${d.title}](${u(`/legal/${d.slug}`)}): ${d.description}`),
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "content-type": "text/plain; charset=utf-8" } });
}
