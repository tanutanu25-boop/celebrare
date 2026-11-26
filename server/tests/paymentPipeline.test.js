import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import { createApp } from "../app.js";
import { seedDemoData } from "../seed/seedDemo.js";
import Payment from "../models/Payment.js";
import Order from "../models/Order.js";
import BankTransaction from "../models/BankTransaction.js";
import AuditLog from "../models/AuditLog.js";
import { processInboundBankEmail } from "../services/paymentVerificationService.js";

let mongoServer;
let app;

const CF_SECRET = "test-cloudflare-worker-secret-123";

function signCloudflarePayload(bodyObj) {
  const raw = JSON.stringify(bodyObj);
  const ts = String(Date.now());
  const sig =
    "sha256=" +
    createHmac("sha256", CF_SECRET).update(`${ts}.${raw}`).digest("hex");
  return { raw, ts, sig };
}

async function loginDemo(photographerId) {
  const res = await request(app)
    .post("/api/auth/demo-login")
    .send({ photographerId });
  assert.equal(res.status, 200);
  return res.body.token;
}

describe("Celebrare Direct UPI Photo Payment System — End-to-End Suite", () => {
  before(async () => {
    process.env.NODE_ENV = "test";
    process.env.DEMO_MODE = "true";
process.env.JWT_SECRET =
  "test-only-jwt-secret-for-celebrare-payment-tests-2026";   
   process.env.DOWNLOAD_TOKEN_SECRET = "test-download-secret";
    process.env.CLOUDFLARE_EMAIL_WEBHOOK_SECRET = CF_SECRET;
    process.env.BANK_WEBHOOK_SECRET = CF_SECRET;

    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
    await seedDemoData();
    app = createApp();
  });

  after(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  it("1-4. Multi-photographer & multi-event galleries, server-side price calc, UPI QR link & 5-minute expiry", async () => {
    const eventsRes = await request(app).get("/api/events");
    assert.equal(eventsRes.status, 200);
    assert.ok(eventsRes.body.events.length >= 4);

    // Photographer A gallery
    const galleryA = await request(app).get(
      "/api/events/navratri-night-2026/gallery"
    );
    assert.equal(galleryA.status, 200);
    assert.equal(galleryA.body.photographer.upiId, "aarav.demo@upi");
    assert.ok(galleryA.body.photos.length >= 3);
    // Ensure private storageKey is never exposed publicly
    assert.equal(galleryA.body.photos[0].storageKey, undefined);

    // Attempt to pass spoofed amount=1 from client; server MUST calculate real photo prices (50 + 60 = 110)
    const orderRes = await request(app).post("/api/orders").send({
      eventId: "navratri-night-2026",
      selectedPhotoIds: [1, 2],
      guestEmail: "guest1@example.com",
      amount: 1,
    });
    assert.equal(orderRes.status, 201);
    assert.equal(orderRes.body.order.totalAmount, 110);
    assert.equal(orderRes.body.payment.expectedAmount, 110);
    assert.equal(orderRes.body.payment.payeeUpiId, "aarav.demo@upi");
    assert.equal(orderRes.body.payment.status, "PENDING");
    assert.ok(
      orderRes.body.payment.upiPaymentLink.includes("pa=aarav.demo%40upi")
    );
    assert.ok(orderRes.body.payment.upiPaymentLink.includes("am=110.00"));
    assert.ok(
      orderRes.body.payment.upiPaymentLink.includes(
        `tr=${orderRes.body.payment.uniquePaymentReference}`
      )
    );

    const createdMs = new Date(orderRes.body.payment.createdAt).getTime();
    const expiresMs = new Date(orderRes.body.payment.expiresAt).getTime();
    assert.equal(expiresMs - createdMs, 5 * 60 * 1000);
  });

  it("5 & 18. Trusted Cloudflare Worker bank email unlocks ONLY purchased photos with signed download URLs", async () => {
    const orderRes = await request(app).post("/api/orders").send({
      eventId: "navratri-night-2026",
      selectedPhotoIds: [1, 2],
      guestEmail: "buyer@example.com",
    });
    const { order, payment } = orderRes.body;

    // Unpaid order MUST be blocked from downloading
    const unpaidDownload = await request(app).post(
      `/api/orders/${order.orderId}/downloads`
    );
    assert.equal(unpaidDownload.status, 403);

    const webhookPayload = {
      from: "HDFC Bank <alerts@hdfcbank.net>",
      sender: "alerts@hdfcbank.net",
      emailMessageId: `<cf-paid-${Date.now()}@hdfcbank.net>`,
      utr: `UTR-VALID-${Date.now()}`,
      amount: 110,
      payeeUpiId: "aarav.demo@upi",
      paymentReference: payment.uniquePaymentReference,
      transactionStatus: "SUCCESS",
      emailAuthResults: { spf: "pass", dkim: "pass", dmarc: "pass" },
    };
    const { raw, ts, sig } = signCloudflarePayload(webhookPayload);

    const webhookRes = await request(app)
      .post("/api/webhooks/bank-email")
      .set("Content-Type", "application/json")
      .set("X-CF-Timestamp", ts)
      .set("X-CF-Worker-Signature", sig)
      .send(raw);

    assert.equal(webhookRes.status, 200);
    assert.equal(webhookRes.body.outcome, "PAID");

    // Request signed download links for purchased photos [1, 2]
    const dlRes = await request(app).post(
      `/api/orders/${order.orderId}/downloads`
    );
    assert.equal(dlRes.status, 200);
    assert.equal(dlRes.body.downloads.length, 2);

    // Download actual protected original file using signed URL
    const fileRes = await request(app).get(dlRes.body.downloads[0].downloadUrl);
    assert.equal(fileRes.status, 200);
    assert.ok(
      fileRes.headers["content-disposition"].includes("attachment")
    );

    // Tampering: requesting unpaid photoId=3 on the paid order MUST be denied
    const tamperDl = await request(app)
      .post(`/api/orders/${order.orderId}/downloads`)
      .send({ photoIds: [3] });
    assert.equal(tamperDl.status, 403);
  });

  it("6-10. Rejects wrong amount, wrong UPI ID, untrusted sender (even with spoofed display name), auth failure, and flags missing reference", async () => {
    const makePending = async () => {
      const r = await request(app).post("/api/orders").send({
        eventId: "navratri-night-2026",
        selectedPhotoIds: [1],
        guestEmail: "check@example.com",
      });
      return r.body.payment;
    };

    // Wrong amount
    const p1 = await makePending();
    const resWrongAmt = await request(app)
      .post("/api/demo/simulate")
      .send({ paymentRequestId: p1.paymentRequestId, scenario: "wrong_amount" });
    assert.equal(resWrongAmt.status, 400);
    assert.equal(resWrongAmt.body.outcome, "REJECTED");

    // Wrong UPI ID (cross-photographer mismatch)
    const p2 = await makePending();
    const resWrongUpi = await request(app)
      .post("/api/demo/simulate")
      .send({ paymentRequestId: p2.paymentRequestId, scenario: "wrong_upi" });
    assert.equal(resWrongUpi.status, 400);
    assert.equal(resWrongUpi.body.outcome, "REJECTED");

    // Untrusted sender with spoofed display name
    const p3 = await makePending();
    const resUntrusted = await request(app)
      .post("/api/demo/simulate")
      .send({
        paymentRequestId: p3.paymentRequestId,
        scenario: "untrusted_sender",
      });
    assert.equal(resUntrusted.status, 403);
    assert.equal(resUntrusted.body.outcome, "REJECTED");

    // SPF/DKIM/DMARC authentication failure
    const p4 = await makePending();
    const resAuthFail = await request(app)
      .post("/api/demo/simulate")
      .send({ paymentRequestId: p4.paymentRequestId, scenario: "auth_failure" });
    assert.equal(resAuthFail.status, 403);
    assert.equal(resAuthFail.body.outcome, "REJECTED");

    // Missing payment reference (same amount exists across multiple orders -> MUST NOT auto-match!)
    const p5 = await makePending();
    const resMissingRef = await request(app)
      .post("/api/demo/simulate")
      .send({
        paymentRequestId: p5.paymentRequestId,
        scenario: "missing_reference",
      });
    assert.equal(resMissingRef.status, 202);
    assert.equal(resMissingRef.body.outcome, "REVIEW_REQUIRED");
  });

  it("11-12 & 15. Duplicate transaction idempotency, transaction reuse denial, and concurrent transaction safety", async () => {
    const order1 = (
      await request(app).post("/api/orders").send({
        eventId: "solan-marathon-2026",
        selectedPhotoIds: [1],
        guestEmail: "runner1@example.com",
      })
    ).body;
    const order2 = (
      await request(app).post("/api/orders").send({
        eventId: "solan-marathon-2026",
        selectedPhotoIds: [1],
        guestEmail: "runner2@example.com",
      })
    ).body;

    const sharedUtr = `UTR-CONCURRENT-${Date.now()}`;
    const payload1 = {
      sender: "alerts@hdfcbank.net",
      emailMessageId: `<conc-${Date.now()}-a@hdfcbank.net>`,
      utr: sharedUtr,
      amount: order1.payment.expectedAmount,
      payeeUpiId: "mountainlens.demo@upi",
      paymentReference: order1.payment.uniquePaymentReference,
      transactionStatus: "SUCCESS",
      emailAuthResults: { spf: "pass", dkim: "pass", dmarc: "pass" },
    };

    // Fire 3 identical concurrent notifications at once
    const concurrentResults = await Promise.all([
      processInboundBankEmail(payload1, { actorType: "cloudflare_worker" }),
      processInboundBankEmail(payload1, { actorType: "cloudflare_worker" }),
      processInboundBankEmail(payload1, { actorType: "cloudflare_worker" }),
    ]);

    const paidCount = concurrentResults.filter(
      (r) => r.outcome === "PAID"
    ).length;
    const dupCount = concurrentResults.filter(
      (r) => r.outcome === "DUPLICATE"
    ).length;
    assert.equal(paidCount, 1);
    assert.equal(dupCount, 2);

    // Attempt to reuse the SAME UTR for order2
    const reuseResult = await processInboundBankEmail(
      {
        ...payload1,
        emailMessageId: `<reuse-${Date.now()}@hdfcbank.net>`,
        paymentReference: order2.payment.uniquePaymentReference,
      },
      { actorType: "cloudflare_worker" }
    );
    assert.equal(reuseResult.outcome, "DUPLICATE");
    const order2Fresh = await Order.findOne({ orderId: order2.order.orderId });
    assert.equal(order2Fresh.status, "PENDING");
  });

  it("16-17. Expired payment request and Late Payment (>5 min) do not unlock photos & support renewal", async () => {
    const orderRes = await request(app).post("/api/orders").send({
      eventId: "garba-festival-2026",
      selectedPhotoIds: [1],
      guestEmail: "late@example.com",
    });
    const { order, payment } = orderRes.body;

    // Simulate payment arriving after 5-minute expiry
    const lateRes = await request(app)
      .post("/api/demo/simulate")
      .send({
        paymentRequestId: payment.paymentRequestId,
        scenario: "late_payment",
      });
    assert.equal(lateRes.status, 410);
    assert.equal(lateRes.body.outcome, "LATE_PAYMENT");

    // Photos MUST remain locked
    const dlAttempt = await request(app).post(
      `/api/orders/${order.orderId}/downloads`
    );
    assert.equal(dlAttempt.status, 403);

    // Also verify backend expiry check transitions expired PENDING requests to EXPIRED
    const expOrderRes = await request(app).post("/api/orders").send({
      eventId: "campus-celebration-2026",
      selectedPhotoIds: [1],
      guestEmail: "exp@example.com",
    });
    const expReqId = expOrderRes.body.payment.paymentRequestId;
    await Payment.updateOne(
      { paymentRequestId: expReqId },
      { $set: { expiresAt: new Date(Date.now() - 10_000) } }
    );

    const statusRes = await request(app).get(
      `/api/payment-requests/${expReqId}/status`
    );
    assert.equal(statusRes.status, 200);
    assert.equal(statusRes.body.payment.status, "EXPIRED");
    // Verify payment status response does not expose private data
const safePayment = statusRes.body.payment;

assert.equal(
  Object.hasOwn(safePayment, "guestEmail"),
  false
);

assert.equal(
  Object.hasOwn(safePayment, "guestId"),
  false
);

assert.equal(
  Object.hasOwn(safePayment, "matchedTransactionId"),
  false
);

assert.equal(
  Object.hasOwn(safePayment, "transactionId"),
  false
);

// Verify nested verification details are not exposed
assert.equal(
  Object.hasOwn(safePayment.verificationSummary || {}, "utr"),
  false
);

assert.equal(
  Object.hasOwn(safePayment.verificationSummary || {}, "emailMessageId"),
  false
);

// Verify response is not cached
assert.equal(statusRes.headers["cache-control"], "no-store");

// Verify related documents contain only required fields
assert.deepEqual(
  Object.keys(statusRes.body.order).filter((key) => key !== "_id"),
  ["orderId"]
);

assert.equal(statusRes.body.photographer.name !== undefined, true);
assert.equal(statusRes.body.photographer.upiId, undefined);
assert.equal(statusRes.body.photographer.profileInfo, undefined);

assert.equal(statusRes.body.event.eventName !== undefined, true);
assert.equal(statusRes.body.event.eventDate, undefined);

    // Guest creates a new 5-minute payment request after expiry
    const renewRes = await request(app).post(
      `/api/payment-requests/${expReqId}/new-request`
    );
    assert.equal(renewRes.status, 201);
    assert.equal(renewRes.body.payment.status, "PENDING");
    assert.notEqual(
      renewRes.body.payment.paymentRequestId,
      expReqId
    );
  });

  it("19-20. Cross-photographer isolation and Admin authorization + Audit Log", async () => {
    const tokenA = await loginDemo("aarav-photo");
    const tokenB = await loginDemo("mountain-lens");
    const adminToken = await loginDemo("celebrare-admin");

    // Photographer B cannot access Photographer A's dashboard or modify A's UPI
    const dashDenied = await request(app)
      .get("/api/photographers/aarav-photo/dashboard")
      .set("Authorization", `Bearer ${tokenB}`);
    assert.equal(dashDenied.status, 403);

    const upiDenied = await request(app)
      .put("/api/photographers/aarav-photo/upi")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ upiId: "hijack@upi" });
    assert.equal(upiDenied.status, 403);

    // Photographer A CAN access own dashboard
    const dashOk = await request(app)
      .get("/api/photographers/aarav-photo/dashboard")
      .set("Authorization", `Bearer ${tokenA}`);
    assert.equal(dashOk.status, 200);

    // Photographer cannot access Admin review endpoints
    const adminDenied = await request(app)
      .get("/api/admin/payment-review")
      .set("Authorization", `Bearer ${tokenA}`);
    assert.equal(adminDenied.status, 403);

    // Admin CAN view queues and manually approve a LATE_PAYMENT transaction with a documented reason
    const lateTx = await BankTransaction.findOne({
      processingStatus: "LATE_PAYMENT",
    });
    assert.ok(lateTx);

    const noReasonRes = await request(app)
      .post(`/api/admin/transactions/${lateTx.transactionRecordId}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ decision: "APPROVE", reason: "ok" });
    assert.equal(noReasonRes.status, 400);

    const approveRes = await request(app)
      .post(`/api/admin/transactions/${lateTx.transactionRecordId}/review`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        decision: "APPROVE",
        reason: "Verified late settlement directly in photographer HDFC statement",
      });
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.body.payment.status, "PAID");

    const auditEntry = await AuditLog.findOne({
      action: "MANUAL_REVIEW_ACTION",
      targetId: lateTx.transactionRecordId,
    });
    assert.ok(auditEntry);
  });

  
  it("Rejects Cloudflare webhook requests when timestamp is missing", async () => {
    const payload = { utr: "TEST-MISSING-TIMESTAMP-123", amount: 100 };
    const raw = JSON.stringify(payload);
    const sig =
      "sha256=" +
      createHmac("sha256", CF_SECRET).update(raw).digest("hex");

    const res = await request(app)
      .post("/api/webhooks/bank-email")
      .set("Content-Type", "application/json")
      .set("X-CF-Worker-Signature", sig)
      .send(raw);

    assert.equal(res.status, 401);
  });
});