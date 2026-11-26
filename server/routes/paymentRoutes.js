import express from "express";
import { createHmac, timingSafeEqual } from "crypto";
import Payment from "../models/Payment.js";
import Order from "../models/Order.js";
import Photographer from "../models/Photographer.js";
import Event from "../models/Event.js";
import { paymentCreateLimiter, webhookLimiter } from "../middleware/rateLimiter.js";
import {
  createOrderAndPaymentRequest,
  createReplacementPaymentRequest,
  processInboundBankEmail,
  syncPaymentExpiry,
} from "../services/paymentVerificationService.js";

const router = express.Router();

// Create Payment Request + Order (supports POST /api/payment-requests and /api/payments/create)
async function handleCreatePaymentRequest(req, res) {
  try {
    const { eventId, selectedPhotoIds, guestEmail, guestId } = req.body;
    const effectiveEmail =
      guestEmail ||
      (guestId && String(guestId).includes("@")
        ? guestId
        : guestId
        ? `${String(guestId).trim()}@guest.celebrare.local`
        : "");

    const result = await createOrderAndPaymentRequest({
      eventId,
      selectedPhotoIds,
      guestEmail: effectiveEmail,
      guestId: guestId || effectiveEmail,
      actorIp: req.ip,
    });

    return res.status(201).json({
      success: true,
      message: "Payment request created (valid for 5 minutes)",
      order: result.order,
      payment: result.payment,
      photographer: result.photographer,
      event: result.event,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to create payment request",
    });
  }
}

router.post("/", paymentCreateLimiter, handleCreatePaymentRequest);
router.post("/create", paymentCreateLimiter, handleCreatePaymentRequest);

// Check Payment Status and enforce server-side 5-minute UTC expiry

async function handleGetPaymentStatus(req, res) {
  try {
    const paymentRequestId =
      req.params.id || req.params.paymentRequestId;

    const payment = await syncPaymentExpiry(paymentRequestId);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment request not found",
      });
    }

    const [order, photographer, event] = await Promise.all([
      Order.findOne({ orderId: payment.orderId })
        .select("orderId")
        .lean(),

      Photographer.findOne({
        photographerId: payment.photographerId,
      })
        .select("photographerId name")
        .lean(),

      Event.findOne({ eventId: payment.eventId })
        .select("eventId eventName")
        .lean(),
    ]);

    // Return only the payment fields needed by the guest UI.
    const safePayment = {
      paymentRequestId: payment.paymentRequestId,
      orderId: payment.orderId,
      photographerId: payment.photographerId,
      eventId: payment.eventId,
      expectedAmount: payment.expectedAmount,
      amount: payment.amount,
      currency: payment.currency,
      payeeUpiId: payment.payeeUpiId,
      uniquePaymentReference: payment.uniquePaymentReference,
      upiPaymentLink: payment.upiPaymentLink,
      status: payment.status,
      expiresAt: payment.expiresAt,
      paidAt: payment.paidAt,
      verificationSummary: payment.verificationSummary?.reason
        ? { reason: payment.verificationSummary.reason }
        : undefined,
    };

    res.set("Cache-Control", "no-store");

    return res.status(200).json({
      success: true,
      serverTime: new Date().toISOString(),
      payment: safePayment,
      order,
      photographer,
      event,
    });
  } catch (error) {
    console.error("Get payment status error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch payment status",
    });
  }
}

router.get("/:id/status", handleGetPaymentStatus);
router.get("/:paymentRequestId", handleGetPaymentStatus);

// Create a fresh 5-minute payment request after expiry or rejection
router.post("/:id/new-request", paymentCreateLimiter, async (req, res) => {
  try {
    const result = await createReplacementPaymentRequest({
      previousPaymentRequestId: req.params.id,
      actorIp: req.ip,
    });

    return res.status(201).json({
      success: true,
      message: "New 5-minute payment request created",
      order: result.order,
      payment: result.payment,
      photographer: result.photographer,
      event: result.event,
    });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      success: false,
      message: error.message || "Unable to create new payment request",
    });
  }
});

// Legacy signed demo webhook — now routed through the full verification & matching pipeline
router.post("/webhook/verify", webhookLimiter, async (req, res) => {
  try {
    if (process.env.DEMO_MODE !== "true") {
      return res.status(403).json({
        success: false,
        message: "Demo mode is disabled",
      });
    }

    const secret = process.env.BANK_WEBHOOK_SECRET;
    const signature = req.headers["x-webhook-signature"];

    if (!secret || !signature || !req.rawBody) {
      return res.status(401).json({
        success: false,
        message: "Webhook authentication details missing",
      });
    }

    const expectedSignature =
      "sha256=" +
      createHmac("sha256", secret).update(req.rawBody).digest("hex");

    const receivedBuffer = Buffer.from(String(signature));
    const expectedBuffer = Buffer.from(expectedSignature);

    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    const { paymentRequestId, transactionId, photographerId, amount } = req.body;
    const payment = await Payment.findOne({ paymentRequestId });
    const photographer = photographerId
      ? await Photographer.findOne({ photographerId })
      : null;

    const result = await processInboundBankEmail(
      {
        utr: transactionId,
        amount,
        payeeUpiId: photographer?.upiId || "",
        paymentReference: payment?.uniquePaymentReference || "",
        paymentRequestId,
        sender: "alerts@hdfcbank.net",
        emailMessageId: `<demo-hmac-${transactionId}@hdfcbank.net>`,
        emailAuthResults: {
          spf: "pass",
          dkim: "pass",
          dmarc: "pass",
          trustedForwarder: true,
        },
        hmacVerified: true,
        transactionStatus: "SUCCESS",
        isDemo: true,
      },
      {
        actorType: "demo_simulator",
        actorId: "signed-demo-webhook",
        ipAddress: req.ip,
      }
    );

    return res.status(result.httpStatus).json({
      success: result.unlocked,
      outcome: result.outcome,
      message: result.reason,
      payment: result.payment,
      transaction: result.transaction,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Demo webhook processing failed",
    });
  }
});

export default router;
