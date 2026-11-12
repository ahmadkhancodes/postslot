// Local stand-in for the Stripe API, used only by tests/e2e/billing. It answers the calls Postslot makes (prices by
// lookup key, customers, subscriptions, Checkout and billing portal sessions) with Stripe-shaped JSON, records every
// request, and has /_test/* control routes so a test can "pay" or "cancel" the way Stripe would after card entry.
// The app reaches it through STRIPE_API_BASE, which src/lib/billing/stripe.ts honours only for sk_test_ keys.
import http from "node:http";

const PORT = Number(process.env.FAKE_STRIPE_PORT ?? 3199);
const BASE = `http://localhost:${PORT}`;
const state = { n: 0, customers: {}, subscriptions: {}, sessions: [], portals: [], requests: [] };
const id = (p) => `${p}_${(++state.n).toString().padStart(6, "0")}`;

/** `a[b][0][c]=x` form and query keys into nested objects, the way Stripe reads them. */
function nest(params) {
  const out = {};
  for (const [k, v] of params) {
    const path = k.replace(/\]/g, "").split("[");
    let o = out;
    path.forEach((p, i) => {
      if (i === path.length - 1) o[p] = v;
      else o = o[p] ??= {};
    });
  }
  return out;
}
const list = (data) => ({ object: "list", data, has_more: false, url: "/v1/list" });

/** Prices exist for every lookup key asked for; app metadata comes from the key prefix, as scripts/stripe-setup.ts does. */
function price(lookupKey) {
  const app = lookupKey.split("_")[0];
  return {
    id: `price_${lookupKey}`, object: "price", active: true, currency: "usd", unit_amount: 100, lookup_key: lookupKey,
    metadata: { app }, recurring: { interval: lookupKey.endsWith("_monthly") ? "month" : "year", interval_count: 1 },
  };
}

function subscriptionFor(session) {
  const priceId = session.line_items["0"].price;
  const p = price(priceId.replace(/^price_/, ""));
  const now = Math.floor(Date.now() / 1000);
  const end = now + (p.recurring.interval === "month" ? 31 : 366) * 86400;
  return {
    id: id("sub"), object: "subscription", customer: session.customer, status: "active", cancel_at_period_end: false,
    metadata: session.subscription_data?.metadata ?? {}, trial_start: null, trial_end: null, current_period_end: end,
    items: { object: "list", data: [{ id: id("si"), price: p, current_period_end: end }] },
  };
}

function send(res, status, body, type = "application/json") {
  res.writeHead(status, { "content-type": type });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
}
const notFound = (res) => send(res, 404, { error: { type: "invalid_request_error", message: "No such object" } });

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  let raw = "";
  for await (const c of req) raw += c;
  const body = req.headers["content-type"]?.includes("json") ? JSON.parse(raw || "{}") : nest(new URLSearchParams(raw));
  const query = nest(url.searchParams);
  const path = url.pathname;
  if (path.startsWith("/v1/")) state.requests.push({ method: req.method, path, query, body, auth: !!req.headers.authorization });

  // Control routes for the test.
  if (path === "/_test/state") return send(res, 200, state);
  if (path === "/_test/pay" && req.method === "POST") {
    const s = state.sessions.find((x) => x.id === body.session);
    if (!s) return notFound(res);
    const sub = subscriptionFor(s);
    state.subscriptions[sub.id] = sub;
    s.status = "complete";
    s.subscription = sub.id;
    return send(res, 200, { session: s, subscription: sub });
  }
  if (path === "/_test/update" && req.method === "POST") {
    const sub = state.subscriptions[body.subscription];
    if (!sub) return notFound(res);
    Object.assign(sub, body.patch);
    return send(res, 200, sub);
  }
  // Hosted pages the browser is sent to.
  const page = /^\/(checkout|portal)\/(\w+)$/.exec(path);
  if (page) return send(res, 200, `<!doctype html><title>Stripe stand-in</title><h1>Stripe ${page[1]} stand-in</h1><p id="ref">${page[2]}</p>`, "text/html");

  // Stripe API.
  if (path === "/v1/prices" && req.method === "GET") return send(res, 200, list(Object.values(query.lookup_keys ?? {}).map(price)));
  if (path === "/v1/customers" && req.method === "POST") {
    const c = { id: id("cus"), object: "customer", email: body.email ?? null, metadata: body.metadata ?? {} };
    state.customers[c.id] = c;
    return send(res, 200, c);
  }
  let m = /^\/v1\/customers\/(\w+)$/.exec(path);
  if (m) {
    const c = state.customers[m[1]];
    if (!c) return notFound(res);
    if (req.method === "POST") c.metadata = { ...c.metadata, ...(body.metadata ?? {}) };
    return send(res, 200, c);
  }
  if (path === "/v1/subscriptions" && req.method === "GET")
    return send(res, 200, list(Object.values(state.subscriptions).filter((s) => !query.customer || s.customer === query.customer)));
  m = /^\/v1\/subscriptions\/(\w+)$/.exec(path);
  if (m) {
    const s = state.subscriptions[m[1]];
    if (!s) return notFound(res);
    if (req.method === "DELETE") s.status = "canceled";
    return send(res, 200, s);
  }
  if (path === "/v1/checkout/sessions" && req.method === "POST") {
    const sid = id("cs_test");
    const s = { id: sid, object: "checkout.session", status: "open", url: `${BASE}/checkout/${sid}`, ...body };
    state.sessions.push(s);
    return send(res, 200, s);
  }
  if (path === "/v1/billing_portal/sessions" && req.method === "POST") {
    const pid = id("bps");
    const p = { id: pid, object: "billing_portal.session", url: `${BASE}/portal/${pid}`, ...body };
    state.portals.push(p);
    return send(res, 200, p);
  }
  return notFound(res);
});

server.listen(PORT, () => console.log(`fake stripe on ${BASE}`));
