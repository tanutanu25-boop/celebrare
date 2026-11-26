# Celebrare — Direct UPI Payments for Event Photos

Celebrare is an end-to-end event photography marketplace where guests browse watermarked event galleries, select photographs, and pay **directly into each photographer's own UPI account**—without Celebrare collecting or holding funds through a payment gateway.

---

## 1. Architecture Overview

```text
┌─────────────────────────┐      REST + Socket.IO       ┌──────────────────────────────────┐
│   React + Vite Client   │ ◄─────────────────────────► │   Express 5 + Socket.IO Server   │
│                         │                             │                                  │
│ • Guest Gallery & QR    │                             │ • Server-Side Price Calculation  │
│ • Photographer Studio   │                             │ • 5-Min UTC Payment Expiry       │
│ • Admin Review Queue    │                             │ • Deterministic Matching Engine  │
│ • Demo Scenario Lab A–E │                             │ • UTR / Msg-ID Idempotency       │
└─────────────────────────┘                             │ • Signed Short-Lived Downloads   │
                                                        └───────────────┬──────────────────┘
                                                                        │
┌─────────────────────────┐   HMAC-SHA256 + Timestamp                   │
│ Cloudflare Email Routing│ ────────────────────────────►               ▼
│  + Email Worker         │   POST /api/webhooks/bank-email   ┌────────────────────────────┐
│                         │                                   │  MongoDB + Private Disk    │
│ • SPF / DKIM / DMARC    │                                   │  (Originals off-webroot)   │
│ • UTR / Ref / Amount    │                                   └────────────────────────────┘
└─────────────────────────┘
```

### Technologies Used
- **Frontend**: React 19, Vite 8, `qrcode.react`, `socket.io-client`, `lucide-react`
- **Backend**: Node.js, Express 5, Socket.IO, Mongoose 9, `bcryptjs`, `jsonwebtoken`, `multer`, `express-rate-limit`
- **Database**: MongoDB (Atlas or local/in-memory for tests)
- **Inbound Email**: Cloudflare Email Routing + Cloudflare Email Worker (`cloudflare/email-worker/src/index.js`)
- **Automated Testing**: `node:test`, `supertest`, `mongodb-memory-server`

---

## 2. Database Models (`server/models/`)

- **Photographer** (`Photographer.js`): `photographerId`, `name`, `email`, `passwordHash`, `role` (`photographer` | `admin`), `upiId`, `profileInfo`, `allowedBankSenders`, `inboundEmailAlias`, `isDemo`
- **Event** (`Event.js`): `eventId`, `photographerId`, `eventName`, `eventDate`, `description`, `status`, `defaultPrice`, `currency`
- **Photo** (`Photo.js`): `photoId` (unique per `eventId`), `photographerId`, `eventId`, `title`, `storageKey` (private disk filename), `thumbnailPath` (watermarked preview route), `price`, `metadata`, `isActive`
- **Order** (`Order.js`): `orderId`, `eventId`, `photographerId`, `guestEmail`, `items` (immutable price snapshot), `selectedPhotoIds`, `totalAmount`, `paymentRequestId`, `status`
- **PaymentRequest** (`Payment.js`): `paymentRequestId`, `orderId`, `photographerId`, `eventId`, `guestEmail`, `expectedAmount`, `payeeUpiId`, `uniquePaymentReference` (`CLB-*`), `upiPaymentLink`, `expiresAt` (UTC `createdAt + 5m`), `status` (`PENDING` | `PAID` | `EXPIRED` | `LATE_PAYMENT` | `REJECTED` | `REVIEW_REQUIRED`), `matchedTransactionId` (unique sparse)
- **BankTransaction** (`BankTransaction.js`): `transactionRecordId`, `utr` (unique sparse), `emailMessageId` (unique sparse), `amount`, `payeeUpiId`, `paymentReference`, `sender`, `displayName` (stored untrusted), `emailAuthResults` (`spf`, `dkim`, `dmarc`), `transactionTimestamp`, `processingStatus`, `decisionReason`, `duplicateCount`, `review`
- **AuditLog** (`AuditLog.js`): Immutable record of order creations, verifications, rejections, duplicates, late payments, downloads, UPI updates, and manual admin reviews.

---

## 3. Setup & Startup Instructions

### Prerequisites
- Node.js 20+ (verified on v24.22.0)
- npm
- MongoDB connection string (`MONGO_URI`)

### Environment Variables (`server/.env`)
Copy `server/.env.example` to `server/.env` and configure your values (never commit `.env` or real secrets):

```env
PORT=5000
MONGO_URI=mongodb+srv://<user>:<password>@cluster0.example.mongodb.net/celebrare
CORS_ORIGIN=http://localhost:5173
DEMO_MODE=true
JWT_SECRET=replace_with_strong_random_secret
DOWNLOAD_TOKEN_SECRET=replace_with_strong_random_secret
CLOUDFLARE_EMAIL_WEBHOOK_SECRET=replace_with_strong_random_secret
BANK_WEBHOOK_SECRET=replace_with_strong_random_secret
ALLOWED_BANK_SENDERS=alerts@hdfcbank.net,upi@icicibank.com,alerts@sbi.co.in,alerts@axisbank.com
```

### Start Backend
```bash
cd /Users/navgurukul/celebrare/server
npm install
npm start
```
The server starts on `http://localhost:5000`, connects to MongoDB, seeds demo data when `DEMO_MODE=true`, and runs a background 5-minute expiry sweeper.

### Start Frontend
```bash
cd /Users/navgurukul/celebrare/client
npm install
npm run dev
```
Open the Vite URL (typically `http://localhost:5173`).

---

## 4. Demo Accounts, Photographers & Events

When `DEMO_MODE=true`, the UI displays **`DEMO MODE — No real money is being transferred.`** and seeds:

| Role | Name | Email | Password | UPI ID | Events |
|---|---|---|---|---|---|
| Photographer A | Aarav Photography | `aarav@celebrare.demo` | `DemoPass123!` | `aarav.demo@upi` | `Navratri Night 2026`, `Garba Festival` |
| Photographer B | Mountain Lens Studio | `mountain@celebrare.demo` | `DemoPass123!` | `mountainlens.demo@upi` | `Solan Marathon 2026`, `Campus Celebration` |
| Admin | Trust & Safety Admin | `admin@celebrare.demo` | `DemoPass123!` | — | Reviews all exception queues |

One-click **Demo Login** buttons are also available in the **Photographer Studio** and **Admin Review** tabs when `DEMO_MODE=true`.

---

## 5. Demonstrating the 5 Required Scenarios (A–E)

Open **Demo Lab (A–E)** in the sidebar (or call `POST /api/demo/simulate`), which sends realistic email events through the **exact same backend verification pipeline** (`processInboundBankEmail`) used by Cloudflare Email Worker webhooks:

- **Scenario A — Successful Payment**:
  1. In **Guest Gallery**, choose `Navratri Night 2026` (`aarav.demo@upi`), select photos, enter a guest email, and create a payment request.
  2. Inspect the live UPI QR code, amount, `CLB-*` reference, and 5-minute countdown.
  3. In **Demo Lab (A–E)**, click **Run Scenario A (Trusted Paid)**.
  4. The guest payment view updates in real time via Socket.IO to **`PAID`** and reveals signed **Download Original** links.
- **Scenario B — Photographer B & Cross-Photographer Isolation**:
  1. Click **Quick Create Order (Photographer B)** (`Solan Marathon 2026`, `mountainlens.demo@upi`) and view its QR/UPI details.
  2. Click **Run Scenario B (Cross-Photographer Deny)** — creates an order for Photographer A and attempts to settle it using another UPI ID. The backend rejects it (`REJECTED`), and Photographer B's studio dashboard remains strictly isolated from A's data.
- **Scenario C — Untrusted / Invalid Emails**:
  - Click **Untrusted Sender**, **SPF/DKIM/DMARC Fail**, **Wrong Amount** (`REJECTED`), or **Missing Reference** (`REVIEW_REQUIRED`). Photos remain locked and full diagnostics appear in the verification logs.
- **Scenario D — Duplicate Transaction Idempotency**:
  - After Scenario A settles a request, click **Run Scenario D (Replay Duplicate UTR)**. The backend returns HTTP `409` (`DUPLICATE`), increments `duplicateCount`, logs `DUPLICATE_DETECTED`, and never double-unlocks.
- **Scenario E — Payment After Five Minutes**:
  - Create a fresh order and click **Run Scenario E (After 5-Min Expiry)**. The controlled demo clock submits a payment after `expiresAt`. The backend marks the transaction and request as `LATE_PAYMENT` (HTTP `410`), keeps photos locked, and queues the transaction inside **Admin Review → Late Payments** for manual admin approval/rejection with a mandatory audit reason.

---

## 6. Photo Access Control & Protected Downloads

1. Gallery endpoints return **only** watermarked preview URLs (`/api/photos/preview/:eventId/:photoId`) and never expose private `storageKey` disk paths (`server/storage/originals/`).
2. `POST /api/orders/:id/downloads` checks that both `Order` and `PaymentRequest` are `PAID` (and not expired), and rejects any request attempting to include `photoIds` outside `order.selectedPhotoIds` (`403`).
3. Short-lived (5-minute) HMAC-SHA256 signed download tokens (`/api/downloads/:token`) are re-verified against live database ownership (`orderId`, `paymentRequestId`, `eventId`, `photographerId`, `photoId`) before streaming the private file.

---

## 7. Cloudflare Email Infrastructure & Limitations

See [cloudflare/README.md](file:///Users/navgurukul/celebrare/cloudflare/README.md) for full setup instructions, `wrangler.toml`, and `cloudflare/email-worker/src/index.js`.

### Payment Verification Limitations & Production Considerations
- **Email is not cryptographic bank settlement proof**: SPF/DKIM/DMARC + Cloudflare Worker HMAC verify that an email originated from an expected mail domain and passed through your worker—not that funds settled in a bank ledger.
- **Ambiguity fails closed**: Missing `CLB-*` reference, missing UTR, or missing payee UPI routes to `REVIEW_REQUIRED` rather than guessing by amount or timestamp.
- **Bank Reconciliation Adapter**: `server/services/reconciliationAdapter.js` defines `BaseBankReconciliationAdapter` so a real bank statement API or NPCI/PSP reconciliation feed can be plugged in before production launch (`NullBankReconciliationAdapter` is active by default and honestly reports `configured: false`).
- **Production Deployment**: Store secrets in environment variables / KMS, set `DEMO_MODE=false`, restrict `CORS_ORIGIN`, enforce HTTPS/TLS termination, and configure real bank alert sender allowlists per photographer.

---

## 8. Running Automated Tests

```bash
cd /Users/navgurukul/celebrare/server
npm test
```
Tests run against an isolated `mongodb-memory-server` instance covering all 20 security, matching, idempotency, expiry, authorization, and download scenarios.
