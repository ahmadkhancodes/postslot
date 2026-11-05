import { product } from "@/config/product";

/** One line to install. Colours from the code tokens; the key placeholder is marked, never a real key. */
export function InstallSnippet() {
  return (
    <pre tabIndex={0} aria-label="Install snippet" className="overflow-x-auto rounded-lg bg-code-bg p-4 font-mono text-sm text-code-text md:p-6">
      <code>
        <span className="text-code-muted">{"<!-- Paste into any HTML form -->"}</span>{"\n"}
        {"<form "}<span className="text-code-accent">action</span>{`="https://${product.host}/f/`}<span className="text-code-accent">{"<form_key>"}</span>{`" `}<span className="text-code-accent">method</span>{`="POST">`}{"\n"}
        {"  <input "}<span className="text-code-accent">name</span>{`="name" required>`}{"\n"}
        {"  <input "}<span className="text-code-accent">name</span>{`="email" type="email" required>`}{"\n"}
        {"  <textarea "}<span className="text-code-accent">name</span>{`="message"></textarea>`}{"\n"}
        {"  <button>Send</button>"}{"\n"}
        {"</form>"}
      </code>
    </pre>
  );
}
