import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const sendingDomain: DocPage = {
  slug: "sending-domain",
  title: "Sending domain",
  description: `Prepare a custom sending domain with SPF, DKIM and DMARC records and check them from the dashboard.`,
  sections: [
    {
      heading: "What it is",
      body: [
        `Pro and Agency can add their own domain under Sending domain in the app. The page shows three DNS records for each domain and a Check records button that looks them up and reports each as pass or fail.`,
        `This feature depends on ${p.name}'s own SMTP path, which is not switched on yet. You can publish and verify the records today, but notifications still go from the shared address until it is live. We will say so here and on the pricing page when it is.`,
      ],
    },
    {
      heading: "The records",
      body: [
        `SPF is a TXT record on the domain: v=spf1 include:${p.sending.spfInclude} ~all. A domain can have only one SPF record, so add our include to the one you have.`,
        `DKIM is a CNAME at ${p.sending.dkimSelector}._domainkey.<your domain> pointing to ${p.sending.dkimTarget}. We rotate the key behind it.`,
        "DMARC is a TXT record at _dmarc.<your domain>. Start with p=none and move to quarantine once the reports look clean.",
      ],
    },
    {
      heading: "Checking",
      body: [
        "DNS changes can take from minutes to a day. Check records as often as you like; it is limited to 10 checks a minute. A check never changes your DNS. Each result says what we found and what was expected.",
      ],
    },
  ],
};
