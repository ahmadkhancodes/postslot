import { product as p } from "@/config/product";
import type { DocPage } from "./types";

export const gettingStarted: DocPage = {
  slug: "getting-started",
  title: "Getting started",
  description: `Create a ${p.name} account, point a form at your endpoint and read your first delivery receipt.`,
  sections: [
    {
      heading: "Create your account",
      body: [
        `Go to ${p.url} and sign in with your email. We send a magic link, so there is no password to set. Your first sign in creates an organization that holds your forms, members and billing.`,
        `New accounts start on the ${p.plans[0]?.name ?? "Free"} plan: ${p.plans[0]?.limits.submissions ?? 250} submissions a month, spam never counted, no card needed.`,
      ],
    },
    {
      heading: "Point a form at your endpoint",
      body: [
        "Create a form to get its endpoint, then set your HTML form's action to it and keep method POST. See Install on your stack for React, Next.js, Astro, Vue, Svelte, Webflow, Framer and WordPress.",
      ],
      code: {
        lang: "html",
        code: `<form action="${p.url}/f/<form_key>" method="POST">\n  <input name="email" type="email" required>\n  <button>Send</button>\n</form>`,
      },
    },
    {
      heading: "Read the receipt",
      body: [
        "Press Send test submission. The submission appears in your inbox with a timeline: received, sorted, dispatched, accepted by the recipient's mail server. Open any submission later to show a client when it arrived.",
      ],
    },
    {
      heading: "Make your first API request",
      body: ["Create an API key under Settings, then send it in the x-api-key header. This call returns the organization the key belongs to."],
      code: {
        lang: "bash",
        code: `curl ${p.url}/api/v1/me \\\n  -H "x-api-key: YOUR_API_KEY"`,
      },
    },
    {
      heading: "What counts toward your limit",
      body: [
        "Delivered legitimate submissions count. Spam and test submissions do not. Over the limit, submissions are held in your inbox, not rejected, and released when you upgrade or the month resets.",
      ],
    },
  ],
};
