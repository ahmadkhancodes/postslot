import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const errors: DocPage = {
  slug: "errors",
  title: "Errors",
  description: `Every error the form endpoint and the API return, what it means and what to do.`,
  sections: [
    {
      heading: "Form endpoint",
      body: [
        "Browser posts get a short page. Requests with Accept: application/json, or a JSON body, get {\"success\":false,\"error\":\"<code>\",\"message\":\"...\"} with the status below.",
        "unknown_form (404): the key in the URL does not match a form. form_paused (403): the form is paused or suspended. domain_mismatch (403): the posting site is not in the form's allowed origins. rate_limited (429): too many posts; wait the Retry-After seconds. payload_too_large (413): over 100 KB. too_many_fields (422): over 25 fields. empty_submission (422): no fields. bad_body (400 or 422): the body could not be read. files_not_supported (422): files are not accepted yet. captcha_failed (422): the proof of work failed or expired. service_unavailable (503): we could not store it; retry after the Retry-After seconds.",
      ],
    },
    {
      heading: "API and dashboard",
      body: [
        "Errors carry a matching HTTP status and a JSON body {\"error\":\"<code>\"}. Match on the code. unauthorized (401): no valid session or API key. forbidden (403): your role does not allow it. not_found (404). invalid_input (400): the body failed validation, with details. bad_json (400). body_too_large (413). bad_origin (403): a browser request came from another origin. rate_limited (429).",
        "plan_required (402 or 403): the plan does not include this or a limit is reached; the details say which meter. workspace_suspended (403) and form_suspended (403): an action was blocked because we suspended the workspace or form. Contact support.",
        "Sending domain: invalid_domain (400), domain_exists (409), domain_limit (403, five domains per workspace).",
      ],
    },
    {
      heading: "Webhook delivery failures",
      body: [
        "Your endpoint must answer 2xx within 10 seconds. Failures retry with backoff and every attempt is logged with the status code or error. See the Webhooks page.",
      ],
    },
    {
      heading: "Still stuck",
      body: [`Email ${p.supportEmail} with the form key and the time of the post. We can find a submission from that.`],
    },
  ],
};
