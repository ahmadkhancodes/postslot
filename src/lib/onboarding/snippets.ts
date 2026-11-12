// Install snippets for the picker. The endpoint URL is the only dynamic part. `ps.js` is optional (time token).
import { product } from "@/config/product";
export interface Snippet { id: string; label: string; language: string; code: string; note?: string }

/** Builders the install picker and the docs have a prompt for, with the words each prompt uses for the project. */
export const AI_BUILDERS = [
  { id: "lovable", label: "Lovable", where: "my app" },
  { id: "bolt", label: "Bolt", where: "my project" },
  { id: "v0", label: "v0", where: "this page" },
  { id: "claude-code", label: "Claude Code", where: "this repository" },
] as const;

/**
 * Prompt for an AI site builder. With the docs' `<form_key>` placeholder it tells the builder to wait for the user's key;
 * with a real endpoint (the in-app picker) the key is already in the URL, so the prompt says to use it exactly.
 */
export function aiBuilderPrompt(where: string, endpoint: string, origin: string): string {
  const placeholder = endpoint.includes("<form_key>");
  return `Make the contact form in ${where} send its submissions to ${product.name}.

- Post the form to ${endpoint} with method POST. Use a normal HTML form action, or fetch with FormData. Do not use a mailto link, a console.log or a mock handler.
${placeholder
    ? "- Replace <form_key> in that URL with my form key. I will paste my key where <form_key> is; do not invent one. If you cannot see a key, leave the placeholder and tell me exactly which line to edit."
    : "- That URL already contains my form key. Use it exactly as written; do not shorten it or invent another one."}
- Give every input a name attribute (for example name, email, message). Inputs without a name are not sent.
- Keep the page working without extra libraries and without any secret in the code. The form key is public by design.
- After the post, show a thank you message, or let ${product.name} redirect to my own thank you page.
- Docs if you need them: ${origin}/llms.txt`;
}

export function snippetsFor(endpoint: string, origin: string): Snippet[] {
  const html = `<form action="${endpoint}" method="POST">
  <label>Email <input type="email" name="email" required></label>
  <label>Message <textarea name="message" required></textarea></label>
  <!-- Spam trap: real visitors never see this -->
  <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" style="display:none">
  <button type="submit">Send</button>
</form>
<script src="${origin}/ps.js" defer></script>`;
  const fetchJs = `// Posts the form on your page with fetch and shows the answer in its place.
const form = document.querySelector("form");
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const res = await fetch("${endpoint}", {
    method: "POST",
    headers: { Accept: "application/json" },
    body: new FormData(form),
  });
  const { success, message } = await res.json(); // { success: true, id: "...", message: "..." }
  form.replaceWith(success ? "Thanks, your message was sent." : message);
});`;
  const react = `export function ContactForm() {
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = Object.fromEntries(new FormData(form));
    const res = await fetch("${endpoint}", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const { success, message } = await res.json();
    alert(success ? "Thanks, your message was sent." : message);
    if (success) form.reset();
  }
  return (
    <form onSubmit={onSubmit}>
      <input name="email" type="email" required />
      <textarea name="message" required />
      <input name="_gotcha" tabIndex={-1} autoComplete="off" style={{ display: "none" }} />
      <button>Send</button>
    </form>
  );
}`;
  const nextjs = `// app/contact/page.tsx: works without client JavaScript
export default function Contact() {
  return (
    <form action="${endpoint}" method="POST">
      <input name="email" type="email" required />
      <textarea name="message" required />
      <input name="_gotcha" tabIndex={-1} autoComplete="off" style={{ display: "none" }} />
      <button type="submit">Send</button>
    </form>
  );
}`;
  const platform = (name: string, where: string) => ({
    id: name.toLowerCase(), label: name, language: "text",
    code: `Form action URL: ${endpoint}\nMethod: POST\nField names: email, message\n${where}`,
  });
  return [
    { id: "html", label: "HTML", language: "html", code: html, note: "Works with no JavaScript. Visitors land on your success URL or a thank-you page." },
    { id: "fetch", label: "fetch", language: "javascript", code: fetchJs, note: "Put it in a script tag after your form. It sends the form with fetch, so visitors stay on the page. No library needed." },
    { id: "react", label: "React", language: "tsx", code: react },
    { id: "nextjs", label: "Next.js", language: "tsx", code: nextjs },
    { id: "astro", label: "Astro", language: "html", code: `---\n// src/pages/contact.astro\n---\n${html}` },
    { id: "vue", label: "Vue", language: "html", code: `<template>\n${html.split("\n").filter((l) => !l.startsWith("<script")).join("\n")}\n</template>` },
    { id: "svelte", label: "Svelte", language: "html", code: html },
    platform("Webflow", "Webflow: Form settings, Action. Turn off Webflow's own form handling."),
    platform("Framer", "Framer: use a Custom Code embed with the HTML snippet."),
    platform("WordPress", "WordPress: add a Custom HTML block with the HTML snippet."),
    ...AI_BUILDERS.map((b) => ({ id: b.id, label: b.label, language: "prompt", code: aiBuilderPrompt(b.where, endpoint, origin), note: `Paste this into ${b.label === "Claude Code" ? "Claude Code from your project folder" : `the ${b.label} chat`}. Your form key is already in it.` })),
  ];
}

/** The first API request, shared by the docs (placeholder key) and the API keys page (the key just created). */
export const apiKeyCurl = (base: string, key: string) => `curl ${base}/api/v1/me \\\n  -H "x-api-key: ${key}"`;
