import express from "express";
import { createHmac, timingSafeEqual } from "crypto";
import { webhookLimiter } from "../middleware/rateLimiter.js";
import { processInboundBankEmail } from "../services/paymentVerificationService.js";
import { recordAuditLog } from "../services/auditService.js";

const router = express.Router();

function verifyCloudflareWorkerSignature(req) {
  const secret =
    process.env.CLOUDFLARE_EMAIL_WEBHOOK_SECRET ||
    process.env.BANK_WEBHOOK_SECRET;

  if (!secret) {
    return { ok: false, reason: "Webhook secret is not configured on server" };
  }

  const signature =
    req.headers["x-cf-worker-signature"] ||
    req.headers["x-webhook-signature"] ||
    "";

  if (!signature || !req.rawBody) {
    return { ok: false, reason: "Missing Cloudflare Worker HMAC signature" };
  }

  // Optional replay protection when Cloudflare Worker sends X-CF-Timestamp
  const tsHeader = req.headers["x-cf-timestamp"];
  if (tsHeader) {
    const tsMs = Number(tsHeader);
    if (!Number.isFinite(tsMs) || Math.abs(Date.now() - tsMs) > 5 * 60 * 1000) {
      return { ok: false, reason: "Stale Cloudflare Worker timestamp" };
    }
  }

  const signedContent = tsHeader
    ? `${tsHeader}.${req.rawBody.toString("utf8")}`
    : req.rawBody;

  const expected =
    "sha256=" +
    createHmac("sha256", secret).update(signedContent).digest("hex");

  const receivedBuf = Buffer.from(String(signature));
  const expectedBuf = Buffer.from(expected);

  if (
    receivedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(receivedBuf, expectedBuf)
  ) {
    return { ok: false, reason: "Invalid Cloudflare Worker HMAC signature" };
  }

  return { ok: true };
}

/**
 * Production Cloudflare Email Worker webhook endpoint:
 * POST /api/webhooks/bank-email
 */
router.post("/bank-email", webhookLimiter, async (req, res) => {
  try {
    const sigCheck = verifyCloudflareWorkerSignature(req);
    if (!sigCheck.ok) {
      await recordAuditLog({
        action: "WEBHOOK_AUTH_FAILED",
        actorType: "cloudflare_worker",
        actorId: req.ip || "unknown",
        details: { reason: sigCheck.reason },
        ipAddress: req.ip,
      });

      return res.status(401).json({
        success: false,
        message: sigCheck.reason,
      });
    }

    const result = await processInboundBankEmail(
      {
        ...req.body,
        hmacVerified: true,
        trustedForwarder: true,
      },
      {
        actorType: "cloudflare_worker",
        actorId: req.headers["x-cf-worker-id"] || "cloudflare-email-worker",
        ipAddress: req.ip,
      }
    );

    return res.status(result.httpStatus).json({
      success: result.unlocked,
      outcome: result.outcome,
      duplicate: result.duplicate,
      message: result.reason,
      transaction: result.transaction,
      payment: result.payment,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to process inbound bank email",
    });
  }
});

/**
 * Demo bank email intake endpoint (DEMO_MODE=true only).
 * Routes directly through the SAME processInboundBankEmail verification & matching pipeline.
 */
router.post("/demo", webhookLimiter, async (req, res) => {
  try {
    if (process.env.DEMO_MODE !== "true") {
      return res.status(403).json({
        success: false,
        message: "Demo mode is disabled",
      });
    }

    const result = await processInboundBankEmail(
      {
        ...req.body,
        utr: req.body.utr || req.body.transactionId,
        payeeUpiId: req.body.payeeUpiId || req.body.recipientUpiId,
        sender: req.body.sender || req.body.from || "alerts@hdfcbank.net",
        emailAuthResults: req.body.emailAuthResults || {
          spf: "pass",
          dkim: "pass",
          dmarc: "pass",
          trustedForwarder: true,
        },
        hmacVerified: true,
        isDemo: true,
      },
      {
        actorType: "demo_simulator",
        actorId: "bank-email-demo-api",
        ipAddress: req.ip,
        nowOverride: req.body.simulatedNow,
        allowClockOverride: Boolean(req.body.simulatedNow),
      }
    );

    return res.status(result.httpStatus).json({
      success: result.unlocked,
      outcome: result.outcome,
      duplicate: result.duplicate,
      message: result.reason,
      transaction: result.transaction,
      payment: result.payment,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Demo bank email processing failed",
    });
  }
});

export default router;
