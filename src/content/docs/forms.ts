import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const forms: DocPage = {
  slug: "forms",
  title: "Forms and the endpoint",
  description: `How a ${p.name} form endpoint works: what you can post, special fields, redirects, recipients and origin lock.`,
  sections: [
    {
      heading: "One endpoint per form",
      body: [
        `Every form has a public key. Its endpoint is ${p.url}/f/<form_key>. Post to it from a plain HTML form, a fetch call or a server. The key is not a secret: abuse is handled by spam filtering, rate limits and the origin lock, not by hiding the URL.`,
        "Urlencoded, multipart (text fields only) and JSON bodies are accepted. A body can be up to 100 KB with up to 25 fields; each value is cut at 20,000 characters. File uploads are not supported yet.",
      ],
      code: {
        lang: "bash",
        code: `curl -X POST ${p.url}/f/<form_key> \\\n  -H "content-type: application/json" \\\n  -H "accept: application/json" \\\n  -d '{"name":"Ada","email":"ada@example.com","message":"Hello"}'`,
      },
    },
    {
      heading: "What the visitor sees",
      body: [
        `A normal browser post gets a 303 redirect to your success page, or to ${p.url}/thanks when none is set. A request that sends an Accept: application/json header, or a JSON body, gets {"success":true,"id":"..."} instead. The submission is saved before the response is sent, so a success means it is stored.`,
        "Spam gets the same success response, so bots learn nothing. The difference is in your inbox: spam goes to the Spam tab.",
      ],
    },
    {
      heading: "Special fields",
      body: [
        "Fields that start with an underscore, and a few well known names, are read by Postslot and are not shown as content: _replyto (or email) sets the Reply-To of the notification, _subject sets the subject, from_name sets the sender name, _redirect picks the page after a human post, and _gotcha (or botcheck) is the honeypot. Everything else is stored and shown as you sent it.",
        "A redirect posted in _redirect is used only when its origin is one of the form's allowed origins, the posting site or our own host. Anything else falls back to the form's success URL. That stops it being used as an open redirect.",
      ],
      code: {
        lang: "html",
        code: `<form action="${p.url}/f/<form_key>" method="POST">\n  <input name="name" required>\n  <input name="email" type="email" required>\n  <textarea name="message"></textarea>\n  <input name="_gotcha" tabindex="-1" autocomplete="off" style="display:none">\n  <input type="hidden" name="_redirect" value="https://example.com/thanks">\n  <button>Send</button>\n</form>`,
      },
    },
    {
      heading: "Name every field",
      body: [
        "Browsers do not send inputs without a name attribute. The form page has a Check and test tab with a field linter: paste your form HTML and it flags inputs without a name, duplicate names and other common mistakes. Send test submission posts through the real endpoint, shows the receipt and is not counted.",
      ],
    },
    {
      heading: "Recipients",
      body: [
        "A form sends each submission to its recipients. Your own sign in address is added and confirmed for you. Any other address gets a confirmation email first and receives nothing until the link is clicked: an unconfirmed address never gets submission content. Submissions that arrive while no recipient is confirmed are held and sent once one is.",
        "If a recipient bounces or marks a message as spam, we stop sending to it and show a banner on the form. Fix the address, press Allow again and then Redeliver on a submission.",
      ],
    },
    {
      heading: "Origin lock",
      body: [
        "Add the sites allowed to post under the form's settings. With at least one origin set, posts from any other site get a 403 domain_mismatch. The owner then gets a troubleshooting email after three rejected posts. Posts with no Origin header (some server to server calls) are also refused while a lock is set, so leave the list empty if you post from a server. Wildcards like *.example.com are accepted.",
      ],
    },
    {
      heading: "Pause, suspend and delete",
      body: [
        "A paused form answers 403 form_paused. A form can also be suspended by us when it is abused; that looks the same to visitors. Delete all submissions on a form removes its stored submissions at once. Everything else is removed after your plan's retention period.",
      ],
    },
  ],
};
