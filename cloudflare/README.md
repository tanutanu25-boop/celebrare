# Cloudflare Email Routing & Email Worker Setup Guide

Celebrare uses **Cloudflare Email Routing** + a **Cloudflare Email Worker** (`cloudflare/email-worker/src/index.js`) to receive incoming bank UPI transaction alerts and forward structured, HMAC-signed payloads to `POST /api/webhooks/bank-email`.

## Architecture Flow

```text
Bank UPI Alert Email
  │
  ▼
Cloudflare Email Routing (payments@your-domain.com)
  │  (Evaluates SPF / DKIM / DMARC into Authentication-Results)
  ▼
Cloudflare Email Worker (src/index.js)
  │  - Extracts envelope From, Message-ID, Authentication-Results
  │  - Parses UTR, Amount, Payee UPI, CLB-* Payment Reference
  │  - Signs body + X-CF-Timestamp with HMAC-SHA256
  ▼
Celebrare Backend (POST /api/webhooks/bank-email)
  │  - Verifies HMAC signature & 5-minute replay window
  │  - Validates sender allowlist & SPF=pass, DKIM=pass, DMARC=pass
  │  - Checks UTR/Message-ID idempotency (prevents duplicates)
  │  - Deterministically matches Order + Photographer UPI + Amount + Reference
  │  - Verifies 5-minute payment expiry window
  │  - Atomically marks PAID & emits Socket.IO update to guest room
```

## Production Configuration Steps

1. **Add your domain to Cloudflare** and enable **Email Routing** in the Cloudflare Dashboard (creates MX and TXT records automatically).
2. **Deploy the Email Worker**:
   ```bash
   cd cloudflare/email-worker
   npm install
   npx wrangler secret put CLOUDFLARE_EMAIL_WEBHOOK_SECRET
   ```
   Set `BACKEND_WEBHOOK_URL` in `wrangler.toml` (e.g., `https://api.celebrare.example/api/webhooks/bank-email`).
   ```bash
   npx wrangler deploy
   ```
3. **Create a Routing Rule**:
   - In Cloudflare Dashboard → Email → Email Routing → Routing Rules:
   - Route `payments@your-domain.com` (or catch-all / plus-addressed `payments+<photographerId>@your-domain.com`) → **Send to a Worker** → `celebrare-bank-email-worker`.
4. **Configure Backend Environment**:
   - Set `CLOUDFLARE_EMAIL_WEBHOOK_SECRET` on the backend to the exact same secret stored in Wrangler.
   - Set `ALLOWED_BANK_SENDERS` (comma-separated) and/or configure bank alert senders per photographer in the Photographer Dashboard.

## Local Development & Testing

Without a live Cloudflare domain or real bank emails, you can test the pipeline in two ways:

1. **Demo Mode (`DEMO_MODE=true`)**:
   - Use the **Demo Scenario Lab** in the frontend or `POST /api/demo/simulate` / `POST /api/bank-email/demo`.
   - Every simulated event runs through the exact same `processInboundBankEmail` verification, trust, expiry, and idempotency engine.
2. **Local Signed Webhook Test (`POST /api/webhooks/bank-email`)**:
   - Sign a JSON payload with `CLOUDFLARE_EMAIL_WEBHOOK_SECRET` using `X-CF-Timestamp` + `X-CF-Worker-Signature: sha256=<hex>` and POST directly to `http://localhost:5000/api/webhooks/bank-email`.

## Important Security & Trust Limitations

- **Email is not cryptographic proof of settlement**: Even with `SPF=pass`, `DKIM=pass`, `DMARC=pass`, and a valid Cloudflare Worker HMAC, an email alert only proves the message came from an expected mail domain.
- Display names are **never** trusted; only envelope/header addresses in the allowlist are accepted.
- When trustworthy details (UTR, Payee UPI, or unique `CLB-*` payment reference) are missing or ambiguous, Celebrare routes the transaction to `REVIEW_REQUIRED` instead of unlocking photographs.
- For production scale, plug an official bank statement feed or NPCI/PSP reconciliation API into `server/services/reconciliationAdapter.js`.
