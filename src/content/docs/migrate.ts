import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const migrate: DocPage = {
  slug: "migrate",
  title: "Switch from Formspree or Web3Forms",
  description: `Move an existing form to ${p.name} in a few minutes: change the action URL, keep your field names.`,
  sections: [
    {
      heading: "Change one attribute",
      body: [
        `Create a form in ${p.name}, copy its endpoint and replace the action of your existing HTML form. Field names stay as they are: email and _replyto set the Reply-To, subject or _subject sets the subject, from_name the sender name, _gotcha and botcheck are the honeypot, and every other field is stored and shown as sent.`,
        "A Formspree form posts to https://formspree.io/f/<id>; a Web3Forms form posts to https://api.web3forms.com/submit with a hidden access_key field. Replace the action, delete the access_key input (it would be shown as an ordinary field) and keep the rest.",
      ],
      code: {
        lang: "html",
        code: `<!-- before -->\n<form action="https://formspree.io/f/xyzabcde" method="POST">\n\n<!-- after -->\n<form action="${p.url}/f/<form_key>" method="POST">`,
      },
    },
    {
      heading: "Check before you cut over",
      body: [
        "Open the form's Check and test tab, paste your form HTML to lint it, press Send test submission and watch the receipt. Then post once from your live site. Lock the form to your domain only after that works.",
        "Redirect and success pages: a redirect field (Web3Forms) works like _redirect, under the same allowed-origin rule. Formspree's _next is not read: set the success URL on the form, or post _redirect.",
      ],
    },
    {
      heading: "Your old submissions",
      body: [
        "Submissions already stored at your previous service stay there: export them from that service as CSV before you cancel. Postslot does not import them, and it never imports data on your behalf.",
        "Your data here is yours too: the inbox exports CSV, and Settings, Profile downloads everything as JSON, including delivery receipts.",
      ],
    },
  ],
};
