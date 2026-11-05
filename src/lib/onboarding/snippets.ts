// Install snippets for the picker. The endpoint URL is the only dynamic part. `ps.js` is optional (time token).
export interface Snippet { id: string; label: string; language: string; code: string; note?: string }

export function snippetsFor(endpoint: string, origin: string): Snippet[] {
  const html = `<form action="${endpoint}" method="POST">
  <label>Email <input type="email" name="email" required></label>
  <label>Message <textarea name="message" required></textarea></label>
  <!-- Spam trap: real visitors never see this -->
  <input type="text" name="_gotcha" tabindex="-1" autocomplete="off" style="display:none">
  <button type="submit">Send</button>
</form>
<script src="${origin}/ps.js" defer></script>`;
  const fetchJs = `const res = await fetch("${endpoint}", {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  body: JSON.stringify({ email, message }),
});
const { success, id, message: info } = await res.json(); // { success: true, id: "..." }`;
  const react = `export function ContactForm() {
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("${endpoint}", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (!(await res.json()).success) alert("Could not send");
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
    { id: "fetch", label: "fetch", language: "javascript", code: fetchJs },
    { id: "react", label: "React", language: "tsx", code: react },
    { id: "nextjs", label: "Next.js", language: "tsx", code: nextjs },
    { id: "astro", label: "Astro", language: "html", code: `---\n// src/pages/contact.astro\n---\n${html}` },
    { id: "vue", label: "Vue", language: "html", code: `<template>\n${html.split("\n").filter((l) => !l.startsWith("<script")).join("\n")}\n</template>` },
    { id: "svelte", label: "Svelte", language: "html", code: html },
    platform("Webflow", "Webflow: Form settings, Action. Turn off Webflow's own form handling."),
    platform("Framer", "Framer: use a Custom Code embed with the HTML snippet."),
    platform("WordPress", "WordPress: add a Custom HTML block with the HTML snippet."),
  ];
}
