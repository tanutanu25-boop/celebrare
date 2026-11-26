
import express from "express";
import { randomBytes } from "crypto";
import Photographer from "../models/Photographer.js";
import Event from "../models/Event.js";
import Payment from "../models/Payment.js";
import BankTransaction from "../models/BankTransaction.js";
import { processInboundBankEmail } from "../services/paymentVerificationService.js";

const router = express.Router();

function ensureDemoMode(_req, res, next) {
  if (process.env.DEMO_MODE !== "true") {
    return res.status(403).json({
      success: false,
      message: "Demo endpoints are disabled when DEMO_MODE is not true",
    });
  }
  next();
}

router.use(ensureDemoMode);

// Demo overview: accounts, events, and recent demo transactions
router.get("/overview", async (_req, res) => {
  try {
    const [accounts, events, recentTransactions] = await Promise.all([
      Photographer.find({ isDemo: true })
        .select("photographerId name email role upiId profileInfo inboundEmailAlias")
        .sort({ createdAt: 1 }),
      Event.find({ isDemo: true }).sort({ createdAt: 1 }),
      BankTransaction.find({ isDemo: true }).sort({ receivedAt: -1 }).limit(30),
    ]);

    return res.status(200).json({
      success: true,
      demoMode: true,
      banner: "DEMO MODE — No real money is being transferred.",
      accounts,
      events,
      recentTransactions,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to load demo overview",
    });
  }
});

/**
 * Simulate realistic inbound bank emails routed through the EXACT same verification & matching pipeline.
 * Supported scenarios:
 *  - success
 *  - untrusted_sender
 *  - auth_failure
 *  - wrong_amount
 *  - wrong_upi
 *  - missing_reference
 *  - duplicate
 *  - late_payment
 */
router.post("/simulate", async (req, res) => {
  try {
    const { paymentRequestId, scenario = "success", customUtr } = req.body;

    if (!paymentRequestId) {
      return res.status(400).json({
        success: false,
        message: "paymentRequestId is required to simulate a bank email",
      });
    }

    const payment = await Payment.findOne({ paymentRequestId });
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment request not found",
      });
    }

    const suffix = randomBytes(3).toString("hex").toUpperCase();
    const baseUtr = customUtr || `DEMO-UTR-${suffix}`;
    const baseMsgId = `<bank-${suffix.toLowerCase()}@hdfcbank.net>`;

    let simulatedNow = new Date();

    let payload = {
      utr: baseUtr,
      amount: payment.expectedAmount,
      payeeUpiId: payment.payeeUpiId,
      paymentReference: payment.uniquePaymentReference,
      paymentRequestId: payment.paymentRequestId,
      emailMessageId: baseMsgId,
      sender: "alerts@hdfcbank.net",
      displayName: "HDFC Bank UPI Alerts",
      subject: `UPI Credit Alert ₹${payment.expectedAmount} Ref ${payment.uniquePaymentReference}`,
      transactionStatus: "SUCCESS",
      payerName: "Demo Guest",
      payerUpiId: "guest.demo@okicici",
      emailAuthResults: {
        spf: "pass",
        dkim: "pass",
        dmarc: "pass",
        trustedForwarder: true,
      },
      hmacVerified: true,
      isDemo: true,
    };

    switch (scenario) {
      case "success":
        break;

      case "untrusted_sender":
        payload.sender = "spoof@evil-phishing.example";
        payload.displayName = "HDFC Bank Official Alerts";
        payload.emailMessageId = `<spoof-${suffix.toLowerCase()}@evil-phishing.example>`;
        break;

      case "auth_failure":
        payload.emailAuthResults = {
          spf: "fail",
          dkim: "fail",
          dmarc: "fail",
          trustedForwarder: true,
        };
        break;

      case "wrong_amount":
        payload.amount = Math.max(1, Number(payment.expectedAmount) - 10);
        payload.subject = `UPI Credit Alert ₹${payload.amount} Ref ${payment.uniquePaymentReference}`;
        break;

      case "wrong_upi":
        payload.payeeUpiId = "other.photographer@upi";
        break;

      case "missing_reference":
        // Remove the reference from EVERY field the parser can inspect.
        // This ensures the service cannot extract it again from subject/body.
        payload.paymentReference = "";
        payload.paymentRequestId = "";
        payload.subject = `UPI Credit Alert ₹${payment.expectedAmount}`;
        payload.textBody = "";
        payload.body = "";
        break;

      case "duplicate": {
        const firstExisting = await BankTransaction.findOne({
          matchedPaymentRequestId: payment.paymentRequestId,
        }).sort({ createdAt: 1 });

        if (firstExisting?.utr) {
          payload.utr = firstExisting.utr;
          payload.emailMessageId = firstExisting.emailMessageId || baseMsgId;
        }
        break;
      }

      case "late_payment":
        // Controlled test clock: 6 minutes after request creation (past 5-minute expiry)
        simulatedNow = new Date(
          new Date(payment.expiresAt).getTime() + 60 * 1000
        );
        payload.transactionTimestamp = simulatedNow.toISOString();
        break;

      default:
        return res.status(400).json({
          success: false,
          message: `Unknown demo scenario '${scenario}'`,
        });
    }

    const result = await processInboundBankEmail(payload, {
      actorType: "demo_simulator",
      actorId: `demo-scenario:${scenario}`,
      ipAddress: req.ip,
      nowOverride: simulatedNow,
      allowClockOverride: scenario === "late_payment",
    });

    return res.status(result.httpStatus).json({
      success: result.unlocked,
      scenario,
      outcome: result.outcome,
      duplicate: result.duplicate,
      message: result.reason,
      simulatedPayload: payload,
      transaction: result.transaction,
      payment: result.payment,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || "Demo simulation failed",
    });
  }
});

export default router;
