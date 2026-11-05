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
    `- Form endpoint: POST a normal HTML form to ${u("/f/<form_key>")}. Every submission gets a delivery receipt.`,
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
