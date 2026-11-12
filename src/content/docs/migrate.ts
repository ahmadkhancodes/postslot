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
        `Create a form in ${p.name}, copy its endpoint and replace the action of your existing HTML form. Field names stay as they are: email and _replyto set the Reply-To, subject or _subject sets the subject, from_name the sender name, _gotcha, botcheck and _honey are the honeypot, redirect, _redirect and _next set the page visitors land on, and every other field is stored and shown as sent.`,
        "A Formspree form posts to https://formspree.io/f/<id>, a Web3Forms form to https://api.web3forms.com/submit with a hidden access_key field, a FormSubmit form to https://formsubmit.co/<address>. Replace the action and keep the rest: access_key, _captcha and _template are ignored, so you can leave them in place and remove them later.",
      ],
      code: {
        lang: "html",
        code: `<!-- before -->\n<form action="https://formspree.io/f/xyzabcde" method="POST">\n\n<!-- after -->\n<form action="${p.url}/f/<form_key>" method="POST">`,
      },
    },
    {
      heading: "Check before you cut over",
      body: [
        "Open the form's Check and test tab and paste your existing form HTML. The check lists what to change and gives you the corrected form to copy, with your endpoint, method POST and a honeypot already in it. Press Send test submission and watch the receipt. Then post once from your live site. Lock the form to your domain only after that works.",
        "Redirect and success pages: a redirect field (Web3Forms) and _next (Formspree, FormSubmit) work like _redirect, under the same allowed-origin rule: the page must be on the site that posted the form or on one of the form's allowed sites; otherwise visitors land on the form's success URL.",
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
