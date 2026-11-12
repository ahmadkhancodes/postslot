import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { product } from "../../../src/config/product";
import { docs } from "../../../src/content/docs";
import { snippetsFor } from "../../../src/lib/onboarding/snippets";
import { fakeIp, signInUI, uniq, watch } from "../qa/helpers";

// "Docs must work": every code sample in the public docs, the landing install snippet and the in-app install picker is run
// against the running app with the reader's real form key and API key. Samples are taken from the same content the pages
// render, and each one is also checked to be on its page as shown. The Node signature verifier (webhooks) runs in
// tests/unit/docs-run.test.ts against the app's real signer, because the app refuses to deliver webhooks to localhost.

test.skip(!!process.env.BASE_URL, "posts real submissions; local app only");

/** Fill every visible field, submit, and expect the post to be accepted (303 to the thank-you page). */
async function submitMarkup(page: Page, markup: string, marker: string, base: string) {
  await page.context().setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() });
  await page.setContent(`<!doctype html><html><body>${markup}</body></html>`);
  for (const f of await page.locator("form input, form textarea").all()) {
    if (!(await f.isVisible())) continue;
    const type = (await f.getAttribute("type")) ?? "text";
    if (["submit", "button", "hidden", "checkbox"].includes(type)) continue;
    await f.fill(type === "email" ? `ada.${marker}@example.com` : `Docs check ${marker}`);
  }
  // ps.js (when the sample loads it) stamps a time token; a human takes longer than 2 s to fill a form.
  if (markup.includes("ps.js")) await page.waitForTimeout(2200);
  await page.locator('form button, form input[type="submit"]').first().click({ timeout: 10_000 });
  await page.waitForURL(`${base}/thanks**`);
  await expect(page.getByRole("heading").first()).toBeVisible();
}

/** Runs a documented curl command (curl URL -X -H -d) through Playwright's HTTP client. */
async function runCurl(request: APIRequestContext, cmd: string) {
  const tokens = (cmd.replace(/\\\n/g, " ").match(/'[^']*'|"[^"]*"|\S+/g) ?? []).map((t) => t.replace(/^(['"])([\s\S]*)\1$/, "$2"));
  expect(tokens[0]).toBe("curl");
  let method: string | undefined, url = "", data: string | undefined;
  const headers: Record<string, string> = { "x-forwarded-for": fakeIp() };
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t === "-X") method = tokens[++i];
    else if (t === "-H") { const h = tokens[++i]!; const c = h.indexOf(":"); headers[h.slice(0, c).trim().toLowerCase()] = h.slice(c + 1).trim(); }
    else if (t === "-d" || t === "--data") data = tokens[++i];
    else if (t.startsWith("-")) throw new Error(`curl flag the test does not know: ${t}`);
    else url = t;
  }
  return request.fetch(url, { method: method ?? (data ? "POST" : "GET"), headers, data });
}

/** The (absolute) form markup inside a framework sample: Astro front matter, Vue <template> and JSX all reduce to it. */
function formMarkup(code: string): string {
  const start = code.indexOf("<form");
  const end = code.lastIndexOf("</form>");
  if (start < 0) throw new Error("no form in sample");
  // A sample that only shows the opening tag (migration "before/after") gets the smallest body a visitor could send.
  if (end < 0) return `${/<form\b[^>]*>(?![\s\S]*<form\b)/.exec(code)![0]}<input name="email" type="email"><textarea name="message"></textarea><button>Send</button></form>`;
  return code.slice(start, end + "</form>".length).replace(/\s(tabIndex|autoComplete)=/g, (_, a: string) => ` ${a.toLowerCase()}=`).replace(/style=\{\{[^}]*\}\}/g, 'style="display:none"')
    .replace(/<(textarea|select|button)\b([^>]*?)\s*\/>/g, "<$1$2></$1>"); // JSX self-closes these; HTML does not
}

test("every docs and install code sample runs against the app with the reader's own key", async ({ page, request, baseURL }) => {
  test.setTimeout(240_000);
  const base = baseURL!;
  const problems = watch(page);
  const email = `docs${uniq()}@studio.test`;
  await signInUI(page, request, email, "Docs Check Co");
  const orgId = (await (await page.request.get("/api/auth/get-session")).json()).session.activeOrganizationId as string;
  const { form } = await (await page.request.post("/api/forms", { data: { name: "Contact page" }, headers: { origin: base } })).json();
  const endpoint = `${base}/f/${form.key}`;

  // An API key through the UI, and the personalised first request it shows: copy, paste, run.
  await page.goto("/app/settings/api-keys");
  await page.getByLabel("Name").fill("Docs check");
  await page.getByRole("button", { name: "Create key" }).click();
  const shown = (await page.getByLabel("First request").innerText()).trim();
  expect(shown).toContain(`${base}/api/v1/me`);
  const key = /x-api-key: (\S+)"/.exec(shown)![1]!;
  const me = await runCurl(request, shown);
  expect(me.status()).toBe(200);
  expect(await me.json()).toEqual({ orgId });

  const personalise = (code: string) => code.split(product.url).join(base).split("<form_key>").join(form.key).split("YOUR_API_KEY").join(key);
  const markers: string[] = [];
  let ran = 0;

  for (const doc of docs) {
    const samples = doc.sections.filter((s) => s.code);
    if (!samples.length) continue;
    await page.goto(`/docs/${doc.slug}`);
    // Docs pages are static: built with the production URL unless the build had another public URL.
    const onPage = (await page.locator("pre").allInnerTexts()).map((t) => t.split(base).join(product.url).trim());
    for (const s of samples) {
      const code = s.code!.code;
      const where = `${doc.slug} / ${s.heading}`;
      expect(onPage, `${where} is shown on its page`).toContain(code.trim());
      const run = personalise(code);
      if (/^curl /.test(run)) {
        const r = await runCurl(request, run);
        expect(r.status(), where).toBe(200);
        const body = await r.json();
        if (run.includes("/api/v1/me")) expect(body, where).toEqual({ orgId });
        else expect(body, where).toMatchObject({ success: true });
      } else if (s.code!.lang === "json") {
        const example = JSON.parse(code) as Record<string, unknown>;
        if ("error" in example) {
          const r = await request.get(`${base}/api/v1/me`, { headers: { "x-api-key": "not-a-real-key", "x-forwarded-for": fakeIp() } });
          expect(r.status(), where).toBe(401);
          expect(await r.json(), where).toEqual(example);
        } else {
          const r = await request.get(`${base}/api/v1/me`, { headers: { "x-api-key": key, "x-forwarded-for": fakeIp() } });
          expect(Object.keys(await r.json()).sort(), where).toEqual(Object.keys(example).sort());
        }
      } else if (s.code!.lang === "prompt") {
        expect(run, where).toContain(`${base}/f/${form.key}`);
        const llms = /(\S+\/llms\.txt)/.exec(run)?.[1];
        expect((await request.get(llms!)).status(), `${where}: ${llms}`).toBe(200);
      } else if (run.includes("<form")) {
        const marker = `d${ran}x${uniq()}`;
        await test.step(where, () => submitMarkup(page, formMarkup(run), marker, base));
        markers.push(marker);
      } else if (s.code!.lang === "text") {
        // Subject template: set it on the form, post, and read the subject of the mail that went out.
        expect((await page.request.patch(`/api/forms/${form._id}`, { data: { subjectTemplate: code }, headers: { origin: base } })).status(), where).toBe(200);
        await request.post(endpoint, { headers: { accept: "application/json", "x-forwarded-for": fakeIp() }, form: { name: "Ada", email: "ada@example.com", message: "Subject check" } });
        await expect.poll(async () => (await (await request.get(`/api/dev/outbox?to=${encodeURIComponent(email)}`)).json()).messages.map((m: { subject: string }) => m.subject), { message: where })
          .toContain("New enquiry from Ada on Contact page");
      } else if (s.code!.lang === "js") {
        expect(code, where).toContain("export function verify"); // executed in tests/unit/docs-run.test.ts
      } else throw new Error(`${where}: no runner for ${s.code!.lang}`);
      ran++;
    }
  }

  // The landing page's install snippet (the first code a visitor copies).
  await page.goto("/");
  const landing = (await page.getByLabel("Install snippet").innerText()).replace(`https://${product.host}`, base).replace("<form_key>", form.key);
  const lm = `land${uniq()}`;
  await submitMarkup(page, formMarkup(landing), lm, base);
  markers.push(lm);

  // The in-app install picker, every tab, exactly as the reader copies it from their form page.
  await page.goto(`/app/forms/${form._id}`);
  const tabs = snippetsFor(endpoint, base);
  for (const sn of tabs) {
    await page.goto(`/app/forms/${form._id}`);
    await page.getByRole("tab", { name: sn.label, exact: true }).click();
    const code = (await page.getByRole("tabpanel").locator("pre").innerText()).trim();
    expect(code, sn.label).toBe(sn.code.trim());
    const marker = `i${sn.id}x${uniq()}`;
    if (sn.id === "fetch") {
      // The fetch snippet goes after a plain form on the reader's page and keeps the visitor there.
      await page.context().setExtraHTTPHeaders({ "x-forwarded-for": fakeIp() });
      await page.setContent(`<!doctype html><html><body><form><input name="email" type="email"><textarea name="message"></textarea><button>Send</button></form><script type="module">${code}</script></body></html>`);
      await page.locator("input[name=email]").fill(`ada.${marker}@example.com`);
      await page.locator("textarea").fill(`Docs check ${marker}`);
      await page.getByRole("button", { name: "Send" }).click();
      await expect(page.getByText("Thanks, your message was sent.")).toBeVisible();
    } else if (sn.id === "react") {
      // JSX needs a build step, so its markup is posted as a plain form here; its JSON fetch call is the one the forms curl sample runs.
      const jsx = formMarkup(code.replace("<form onSubmit={onSubmit}>", `<form action="${endpoint}" method="POST">`));
      await submitMarkup(page, jsx, marker, base);
    } else if (sn.language === "prompt") {
      // AI builder prompts in the app carry the real endpoint, never the docs placeholder; the docs link they give works.
      expect(code, sn.label).toContain(`${endpoint} with method POST`);
      expect(code, sn.label).not.toContain("<form_key>");
      expect((await request.get(/(\S+\/llms\.txt)/.exec(code)![1]!)).status(), sn.label).toBe(200);
      continue;
    } else if (sn.language === "text") {
      const action = /Form action URL: (\S+)/.exec(code)![1]!;
      expect(/Method: (\w+)/.exec(code)![1]).toBe("POST");
      const names = /Field names: (.+)/.exec(code)![1]!.split(/,\s*/);
      await submitMarkup(page, `<form action="${action}" method="POST">${names.map((n) => `<input name="${n}"${n === "email" ? ' type="email"' : ""}>`).join("")}<button>Send</button></form>`, marker, base);
    } else {
      await submitMarkup(page, formMarkup(code), marker, base);
    }
    markers.push(marker);
  }

  // Every sample's post is in the inbox as a real (not spam) submission.
  await page.context().setExtraHTTPHeaders({});
  const csv = await (await page.request.get("/api/submissions/export")).text();
  for (const m of markers) expect(csv, `submission ${m} in the export`).toContain(m);
  expect(ran).toBeGreaterThanOrEqual(15);
  expect(markers.length, "doc forms + landing + every install tab except the AI prompts").toBeGreaterThanOrEqual(20);
  expect(problems.filter((p) => !/example\.com|^failed: .*\/ps\.js/.test(p))).toEqual([]);
});
