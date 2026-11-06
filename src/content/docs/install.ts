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

/** Same prompt for every builder, with one placeholder for the key. No key is filled in: the user pastes their own. */
const aiPrompt = (where: string) => `Make the contact form in ${where} send its submissions to ${p.name}.

- Post the form to ${endpoint} with method POST. Use a normal HTML form action, or fetch with FormData. Do not use a mailto link, a console.log or a mock handler.
- Replace <form_key> in that URL with my form key. I will paste my key where <form_key> is; do not invent one. If you cannot see a key, leave the placeholder and tell me exactly which line to edit.
- Give every input a name attribute (for example name, email, message). Inputs without a name are not sent.
- Keep the page working without extra libraries and without any secret in the code. The form key is public by design.
- After the post, show a thank you message, or let ${p.name} redirect to my own thank you page.
- Docs if you need them: ${p.url}/llms.txt`;

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
        "Lovable, Bolt, v0 and Claude Code often generate a submit handler that only logs to the console. Copy the prompt for your builder below and paste it into the chat. Each prompt tells the builder where to put your form key: you copy the key from your form in the Postslot dashboard and paste it where the prompt says. The full documentation is also available as plain text at /llms.txt and /llms-full.txt.",
      ],
    },
    { heading: "Lovable", body: ["Paste this into the Lovable chat."], code: { lang: "prompt", code: aiPrompt("my app") } },
    { heading: "Bolt", body: ["Paste this into the Bolt chat."], code: { lang: "prompt", code: aiPrompt("my project") } },
    { heading: "v0", body: ["Paste this into the v0 chat."], code: { lang: "prompt", code: aiPrompt("this page") } },
    { heading: "Claude Code", body: ["Paste this into Claude Code from your project folder."], code: { lang: "prompt", code: aiPrompt("this repository") } },
  ],
};
