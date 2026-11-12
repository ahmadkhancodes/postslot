/**
 * Design QA screenshots (light, 1440 and 375): marketing pages plus signed-in app screens with realistic seeded data.
 *   BASE_URL=http://localhost:3100 OUT_DIR=docs/qa/design npx tsx scripts/design-shots.ts [only-prefix]
 * Needs a server started with DB_DRIVER=memory E2E_OUTBOX=1 MAIL_PROVIDER=console (see playwright.config.ts).
 */
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const OUT = process.env.OUT_DIR ?? "docs/qa/design";
const ONLY = process.argv[2];
const FULL = process.env.FULL !== "0";
const MARKETING = ["/", "/pricing", "/docs", "/compare/web3forms", "/sign-in"];

async function settle(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((s) => setTimeout(s, 30)); }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);
}
const nameOf = (r: string) => (r === "/" ? "home" : r.slice(1).replace(/[/?=&]/g, "_"));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM, args: ["--no-sandbox"] } : {});
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light", extraHTTPHeaders: { "x-forwarded-for": `10.9.${Date.now() % 250}.7` } });
  const page = await ctx.newPage();
  const origin = { origin: BASE };
  const email = `jake+${Date.now()}@harborstudio.test`;
  await page.request.post(`${BASE}/api/auth/sign-in/magic-link`, { data: { email, callbackURL: "/app" }, headers: origin });
  const box = await (await page.request.get(`${BASE}/api/dev/outbox?to=${encodeURIComponent(email)}`)).json();
  await page.goto(/https?:\/\/\S+magic-link\/verify\S+/.exec(box.messages.at(-1).text)![0]);
  const org = await page.request.post(`${BASE}/api/auth/organization/create`, { data: { name: "Harbor Studio", slug: `harbor-${Date.now()}` }, headers: origin });
  await page.request.post(`${BASE}/api/auth/organization/set-active`, { data: { organizationId: (await org.json()).id }, headers: origin });
  const forms: { _id: string; key: string }[] = [];
  for (const n of ["Bakery contact page", "Dental clinic booking", "Studio quote request"]) {
    forms.push((await (await page.request.post(`${BASE}/api/forms`, { data: { name: n }, headers: origin })).json()).form);
  }
  const subs = [
    { name: "Mara Okafor", email: "mara@okafor-dental.test", message: "Could you quote a rebrand of our clinic site? We open a second location in March." },
    { name: "Tom Reyes", email: "tom@reyesbakery.test", message: "Is the wholesale order form still taking orders for Saturday?" },
    { name: "Linda Chen", email: "linda@northshorefood.test", message: "We run a food bank and need a volunteer sign-up form. Do you have a non-profit rate?" },
    { name: "Sam Patel", email: "sam@patelandco.test", message: "The contact form on our homepage shows a blank page after submit. Can you check?" },
  ];
  let i = 0;
  for (const s of subs) await page.request.post(`${BASE}/f/${forms[i++ % 2].key}`, { data: s, headers: { accept: "application/json", "x-forwarded-for": `10.1.1.${i}` } });
  await page.request.post(`${BASE}/f/${forms[0].key}`, { data: { message: "cheap pills", _gotcha: "x" }, headers: { accept: "application/json", "x-forwarded-for": "10.2.2.2" } });

  const appRoutes = ["/app", "/app/forms", `/app/forms/${forms[0]._id}`, `/app/forms/${forms[0]._id}/onboarding`, "/app/usage", "/app/billing", "/app/domains", "/app/settings/profile", "/app/settings/members", "/app/settings/api-keys"];
  // Marketing pages and sign-in are shot signed out (sign-in redirects a signed-in visitor to /app).
  const pub = await (await browser.newContext({ colorScheme: "light" })).newPage();
  const jobs: [Page, string[]][] = [[pub, MARKETING], [page, appRoutes]];
  for (const [p, list] of jobs) {
    for (const width of [1440, 375]) {
      await p.setViewportSize({ width, height: width < 800 ? 812 : 900 });
      for (const r of list.filter((x) => !ONLY || x.startsWith(ONLY))) {
        await p.goto(BASE + r, { waitUntil: "networkidle" });
        await settle(p);
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (overflow > 0) console.error(`${r} @${width}: horizontal overflow ${overflow}px`);
        await p.screenshot({ path: `${OUT}/${nameOf(r.replace(forms[0]._id, "id"))}-${width}.png`, fullPage: FULL });
      }
    }
  }
  await browser.close();
  console.log(`screenshots in ${OUT}`);
}
main();
