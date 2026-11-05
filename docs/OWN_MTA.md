# Own mail server path (KumoMTA or Postfix)

Status: **code ready, no server running.** `MAIL_PROVIDER=smtp` makes the app send through any SMTP server. The default provider does not change. The flag `own_mta_live` stays `off` and the site must not claim own mail servers until the owner turns it on (docs/MANUAL_STEPS.md item 4).

## What the app does

- `src/lib/mail/smtp.ts`: `smtpTransport()` implements the `MailTransport` interface with `nodemailer` (MIT-0 licence, the only dependency added for this; `@types/nodemailer` is dev-only). One connection per send (serverless friendly).
- **DKIM** signing can be done by the app (nodemailer `dkim` option) or, better, by the MTA. Set `SMTP_DKIM_DOMAIN`, `SMTP_DKIM_SELECTOR`, `SMTP_DKIM_PRIVATE_KEY` (PEM, `\n` allowed) to sign in the app. Leave them unset when KumoMTA or Postfix+OpenDKIM signs.
- **VERP return path:** the envelope sender is `bounce+<message id>=<local>=<domain>@<SMTP_BOUNCE_DOMAIN>`. A bounce addressed to it identifies the message and recipient even when the body is unreadable. The message id is also the `Message-ID` local part and an `X-Postslot-Id` header.
- **Bounces:** pipe the bounce mailbox to `POST /api/hooks/dsn` with `Authorization: Bearer $DSN_WEBHOOK_SECRET` (or `x-webhook-secret`). The body is the raw message, or JSON `{"raw":"..."}`. `src/lib/mail/dsn.ts` parses RFC 3464 DSNs and RFC 5965 abuse reports into `MailEvent`s (`returned` hard/soft/block, `deferred`, `accepted`, `complaint`), which go through the same code as the provider webhook: suppression list, receipt, owner banner, webhooks.
- **Warm-up cap:** `SMTP_DAILY_CAP` limits messages per UTC day. Over it, sends fail with `smtp_daily_cap_reached` and deliveries stay queued with the normal backoff, then go out the next day (raise the cap along the warm-up schedule below).
- **Receipts:** SMTP gives no "accepted by the recipient" event unless the MTA reports one. After the hand-over the receipt shows Dispatched; a DSN with `Action: delivered`, or a KumoMTA log hook posting the same shape, moves it to Accepted. A message with no news stays Dispatched. Do not present Dispatched as delivered.

## Environment

| Variable | Meaning |
|---|---|
| `MAIL_PROVIDER=smtp` | select this path |
| `SMTP_HOST`, `SMTP_PORT` (587), `SMTP_SECURE` (`true` for 465) | the server |
| `SMTP_USER`, `SMTP_PASS` | auth, if the server needs it |
| `SMTP_BOUNCE_DOMAIN` | domain of the VERP return path (default: domain of `MAIL_FROM`) |
| `SMTP_DAILY_CAP` | warm-up cap per day, 0 or unset = none |
| `SMTP_DKIM_*` | optional in-app DKIM |
| `DSN_WEBHOOK_SECRET` | shared secret for `/api/hooks/dsn` |

## Server setup checklist

1. **Server and IP.** A VPS with a clean IPv4 and port 25 open outbound (many clouds block it; ask the host). Static IP, no shared NAT.
2. **rDNS / PTR.** The IP's PTR must be a hostname (for example `mta1.postslot.buffersoltech.com`) and that hostname's A record must point back at the IP. Use the same name as the SMTP HELO.
3. **SPF.** `postslot.buffersoltech.com` TXT: `v=spf1 ip4:<server ip> ~all`. For customer domains the include `_spf.postslot.buffersoltech.com` (see `product.sending`) must resolve to the same ip4 list. Move to `-all` after warm-up.
4. **DKIM.** Generate a 2048-bit key (`openssl genrsa -out dkim.pem 2048`), publish the public key at `<selector>._domainkey.postslot.buffersoltech.com` TXT. For customers, publish the same key at `postslot1.dkim.postslot.buffersoltech.com` so their CNAME works, and rotate by changing that name only.
5. **DMARC.** `_dmarc.postslot.buffersoltech.com` TXT: `v=DMARC1; p=none; rua=mailto:dmarc@buffersoltech.com`. Read reports for two weeks, then `p=quarantine; pct=100`, later `p=reject`.
6. **Bounce domain.** MX for `SMTP_BOUNCE_DOMAIN` pointing at the MTA. Route local parts that start with `bounce+` to a pipe or HTTP hook that POSTs the raw message to `/api/hooks/dsn`.
7. **TLS.** A valid certificate for the HELO name; require STARTTLS on submission (587). Opportunistic TLS outbound.
8. **Abuse and feedback loops.** Monitor `abuse@`/`postmaster@`. Register with Microsoft SNDS and JMRP, Google Postmaster Tools, and Yahoo's complaint feedback loop. ARF reports can be posted to `/api/hooks/dsn`.

### KumoMTA

- Install KumoMTA, define an egress source with the IP and its EHLO domain, and a `shaping.toml` that limits connections and messages per destination domain (start at 1 connection and about 20 messages a minute per big mailbox provider).
- DKIM: sign in `init.lua` with `kumo.dkim.rsa_sha256_signer` (domain, selector, key file) in `smtp_server_message_received`, so the app does not need `SMTP_DKIM_*`.
- Expose an SMTP listener on 587 with auth (`SMTP_USER`/`SMTP_PASS`). Rewrite nothing: the envelope sender comes from the app (VERP).
- Logs: configure a log hook (`kumo.configure_log_hook`) that POSTs `Delivery`, `Bounce` and `TransientFailure` records to a small relay which builds a DSN-shaped body (or JSON `raw`) for `/api/hooks/dsn`. A `Delivery` record becomes `Action: delivered`.

### Postfix

- `main.cf` basics: `myhostname = mta1.postslot.buffersoltech.com`, `smtpd_tls_security_level = may`, `smtp_tls_security_level = may`, `smtp_helo_name = $myhostname`.
- DKIM with OpenDKIM (milter) if the app does not sign.
- Bounce pipe: `virtual_alias_maps` or `recipient_regexp` routes `bounce+*@<bounce domain>` to a transport that runs `curl -sS --data-binary @- -H "Authorization: Bearer $DSN_WEBHOOK_SECRET" https://postslot.buffersoltech.com/api/hooks/dsn`.
- Rate limits: `default_destination_rate_delay`, `default_destination_concurrency_limit = 2`, and per-domain transport maps for Gmail/Outlook/Yahoo.

## Warm-up caps (suggested `SMTP_DAILY_CAP`)

| Day | Messages per day |
|---|---|
| 1 to 3 | 50 |
| 4 to 7 | 200 |
| 8 to 14 | 1,000 |
| 15 to 21 | 5,000 |
| 22 to 30 | 20,000 |
| 31+ | remove the cap, watch complaint rate (< 0.1%) and bounce rate (< 2%) |

Send real, wanted mail only (submission notifications to confirmed recipients). Pause the ramp when bounces pass 4% or complaints pass 0.08%: the founder admin flags the same thresholds.

## Switching on

1. Set the env vars in Vercel, redeploy.
2. Send a test submission to a Gmail and an Outlook recipient. Check headers: `spf=pass`, `dkim=pass`, `dmarc=pass`.
3. Bounce a message on purpose (send to a non-existing mailbox) and confirm it appears as Returned with the address suppressed.
4. Only then flip the flag `own_mta_live` to `on`.
