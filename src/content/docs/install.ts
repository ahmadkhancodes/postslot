import { product as p } from "@/config/product";
import type { DocPage } from "./types";

const endpoint = `${p.url}/f/<form_key>`;

const html = `<form action="${endpoint}" method="POST">
  <input name="name" required>
  <input name="email" type="email" required>
  <textarea name="message"></textarea>
  <button>Send</button>
</form>`;

const react = `export function ContactForm() {
  return (
    <form action="${endpoint}" method="POST">
      <input name="name" required />
      <input name="email" type="email" required />
      <textarea name="message" />
      <button type="submit">Send</button>
    </form>
  );
}`;

const next = `// app/contact/page.tsx (works as a server component, no client JavaScript)
export default function ContactPage() {
  return (
    <form action="${endpoint}" method="POST">
      <input name="name" required />
      <input name="email" type="email" required />
      <textarea name="message" />
      <button type="submit">Send</button>
    </form>
  );
}`;

const astro = `---
// src/pages/contact.astro
---
<form action="${endpoint}" method="POST">
  <input name="name" required />
  <input name="email" type="email" required />
  <textarea name="message"></textarea>
  <button type="submit">Send</button>
</form>`;

const vue = `<template>
  <form action="${endpoint}" method="POST">
    <input name="name" required />
    <input name="email" type="email" required />
    <textarea name="message"></textarea>
    <button type="submit">Send</button>
  </form>
</template>`;

const svelte = `<form action="${endpoint}" method="POST">
  <input name="name" required />
  <input name="email" type="email" required />
  <textarea name="message"></textarea>
  <button type="submit">Send</button>
</form>`;

export const install: DocPage = {
  slug: "install",
  title: "Install on your stack",
  description: `Copy paste ${p.name} form snippets for HTML, React, Next.js, Astro, Vue, Svelte, Webflow, Framer and WordPress.`,
  sections: [
    {
      heading: "How it works",
      body: [
        `Every form posts to your endpoint, ${endpoint}. Replace <form_key> with the key shown on your form. The key is public by design, like a form action URL, so lock it to your domain in the form's allowed domains.`,
        "Every input needs a name attribute. Inputs without one are not sent, and the Send test submission button warns you about them.",
      ],
    },
    { heading: "HTML", body: ["Works on any static page."], code: { lang: "html", code: html } },
    { heading: "React", body: ["A plain form post, no state needed."], code: { lang: "tsx", code: react } },
    { heading: "Next.js", body: ["Use the endpoint as the form action in a server component."], code: { lang: "tsx", code: next } },
    { heading: "Astro", body: ["Add the form to any page."], code: { lang: "astro", code: astro } },
    { heading: "Vue", body: ["Use it in a single file component."], code: { lang: "vue", code: vue } },
    { heading: "Svelte", body: ["Use it in any Svelte or SvelteKit page."], code: { lang: "svelte", code: svelte } },
    {
      heading: "Webflow",
      body: [
        "Select your form block, open Settings, and set Action to your endpoint and Method to POST. Keep the field names you want in your email. Publish the site, then press Send test submission in Postslot.",
      ],
    },
    {
      heading: "Framer",
      body: [
        `In Framer, add the Form component, choose Custom as the destination and paste your endpoint, ${endpoint}. Name each field so it appears in the submission.`,
      ],
    },
    {
      heading: "WordPress",
      body: [
        "Add a Custom HTML block and paste the HTML snippet above. If your form plugin supports a custom action URL, set it to your endpoint with method POST.",
      ],
    },
    {
      heading: "AI builders",
      body: [
        "Lovable, Bolt, v0 and Claude Code often generate a submit handler that only logs to the console. Ask the builder to post the form to your endpoint instead, using the snippet above. The full documentation is also available as plain text at /llms.txt and /llms-full.txt.",
      ],
    },
  ],
};
