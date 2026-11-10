import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const templates: DocPage = {
  slug: "templates",
  title: "Email templates",
  description: `Choose how a submission notification looks, write the subject with fields and preview it before you send.`,
  sections: [
    {
      heading: "Three layouts",
      body: [
        "Open a form, then Email template. Default is a card with one row per field. Compact table is a dense bordered table, good for forms with many fields. Plain text has no HTML at all, for clients that block formatting.",
        "Every notification also carries a plain text part, so it reads well in any client.",
      ],
    },
    {
      heading: "Subject",
      body: [
        "The subject is a template. Put a field name in double braces to insert its value, for example New enquiry from {{name}}. {{form}} is the form's name. A missing field becomes empty. Line breaks are removed from the result and it is cut at 200 characters.",
      ],
      code: { lang: "text", code: "New enquiry from {{name}} on {{form}}" },
    },
    {
      heading: "Preview matches what is sent",
      body: [
        "The preview runs the same renderer as the real send, on an example submission, so what you see is what recipients get. Field values are escaped, so markup in a message is shown as text and cannot run.",
      ],
    },
    {
      heading: "Reply-To",
      body: [
        `Replying to the notification replies to the visitor: Reply-To is set from the _replyto field, or from a field named email. ${p.name} never sets From to the visitor's address, because that would break sender checks.`,
      ],
    },
    {
      heading: "Sending domain",
      body: [
        "Pro and Agency can prepare a custom sending domain under Sending domain: the page lists the SPF, DKIM and DMARC records and checks them. Sending from your own domain depends on our SMTP path, which is not live yet, so notifications still come from the shared address.",
      ],
    },
  ],
};
