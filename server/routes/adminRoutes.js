import express from "express";
import BankTransaction from "../models/BankTransaction.js";
import Payment from "../models/Payment.js";
import Order from "../models/Order.js";
import AuditLog from "../models/AuditLog.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { recordAuditLog } from "../services/auditService.js";
import { emitPaymentStatusUpdate } from "../services/realtimeService.js";
import { expireAllStaleRequests } from "../services/paymentVerificationService.js";

const router = express.Router();

// Admin Payment Review Queue (requires authenticated Admin)
router.get("/payment-review", requireAuth, requireAdmin, async (req, res) => {
  try {
    await expireAllStaleRequests();

    const [
      reviewTransactions,
      lateTransactions,
      rejectedTransactions,
      duplicateTransactions,
      expiredPayments,
      auditLogs,
    ] = await Promise.all([
      BankTransaction.find({
        processingStatus: { $in: ["REVIEW_REQUIRED", "UNMATCHED"] },
      })
        .sort({ receivedAt: -1 })
        .limit(100),
      BankTransaction.find({ processingStatus: "LATE_PAYMENT" })
        .sort({ receivedAt: -1 })
        .limit(100),
      BankTransaction.find({ processingStatus: "REJECTED" })
        .sort({ receivedAt: -1 })
        .limit(100),
      BankTransaction.find({ duplicateCount: { $gt: 0 } })
        .sort({ updatedAt: -1 })
        .limit(100),
      Payment.find({
        status: { $in: ["EXPIRED", "LATE_PAYMENT", "REVIEW_REQUIRED", "REJECTED"] },
      })
        .sort({ updatedAt: -1 })
        .limit(100),
      AuditLog.find().sort({ createdAt: -1 }).limit(150),
    ]);

    return res.status(200).json({
      success: true,
      queues: {
        reviewTransactions,
        lateTransactions,
        rejectedTransactions,
        duplicateTransactions,
        expiredPayments,
      },
      auditLogs,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to load admin review queue",
    });
  }
});

// List all transactions (Admin only)
router.get("/transactions", requireAuth, requireAdmin, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.processingStatus = String(req.query.status).toUpperCase();
    }
    const transactions = await BankTransaction.find(filter)
      .sort({ receivedAt: -1 })
      .limit(200);

    return res.status(200).json({
      success: true,
      count: transactions.length,
      transactions,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to fetch transactions",
    });
  }
});

// List audit logs (Admin only)
router.get("/audit-logs", requireAuth, requireAdmin, async (req, res) => {
  try {
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(200);
    return res.status(200).json({
      success: true,
      logs,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Unable to load audit logs",
    });
  }
});

// Manually review a transaction with mandatory documented reason and audit trail
router.post("/transactions/:id/review", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { decision, reason, paymentRequestId } = req.body;
    const normalizedDecision = String(decision || "").trim().toUpperCase();

    if (!["APPROVE", "REJECT"].includes(normalizedDecision)) {
      return res.status(400).json({
        success: false,
        message: "Decision must be APPROVE or REJECT",
      });
    }
    if (!reason || String(reason).trim().length < 5) {
      return res.status(400).json({
        success: false,
        message: "A documented review reason (minimum 5 characters) is required",
      });
    }

    const tx = await BankTransaction.findOne({
      transactionRecordId: req.params.id,
    });
    if (!tx) {
      return res.status(404).json({
        success: false,
        message: "Transaction record not found",
      });
    }

    const targetPaymentId = paymentRequestId || tx.matchedPaymentRequestId;
    const trimmedReason = String(reason).trim();

    if (normalizedDecision === "APPROVE") {
      if (!targetPaymentId) {
        return res.status(400).json({
          success: false,
          message: "paymentRequestId is required to manually approve an unmatched transaction",
        });
      }

      const payment = await Payment.findOne({ paymentRequestId: targetPaymentId });
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Target payment request not found",
        });
      }
      if (payment.status === "PAID") {
        return res.status(409).json({
          success: false,
          message: "Payment request is already PAID",
        });
      }

      const now = new Date();
      const updatedPayment = await Payment.findOneAndUpdate(
        {
          paymentRequestId: targetPaymentId,
          status: { $ne: "PAID" },
        },
        {
          $set: {
            status: "PAID",
            matchedTransactionId: tx.utr || tx.transactionRecordId,
            transactionId: tx.utr || tx.transactionRecordId,
            paidAt: now,
            verificationSummary: {
              reason: `Manual admin approval: ${trimmedReason}`,
              verifiedAt: now,
              emailMessageId: tx.emailMessageId || "",
              utr: tx.utr || "",
              manualReview: true,
            },
          },
        },
        { returnDocument: "after" }
      );

      await Order.updateOne(
        { orderId: updatedPayment.orderId },
        { $set: { status: "PAID", paidAt: now } }
      );

      tx.processingStatus = "MANUALLY_APPROVED";
      tx.matchedPaymentRequestId = updatedPayment.paymentRequestId;
      tx.matchedOrderId = updatedPayment.orderId;
      tx.photographerId = updatedPayment.photographerId;
      tx.review = {
        reviewedBy: req.user.photographerId,
        decision: "APPROVE",
        reason: trimmedReason,
        reviewedAt: now,
      };
      await tx.save();

      await recordAuditLog({
        action: "MANUAL_REVIEW_ACTION",
        actorType: "admin",
        actorId: req.user.photographerId,
        targetType: "BankTransaction",
        targetId: tx.transactionRecordId,
        photographerId: updatedPayment.photographerId,
        details: {
          decision: "APPROVE",
          reason: trimmedReason,
          paymentRequestId: updatedPayment.paymentRequestId,
          orderId: updatedPayment.orderId,
        },
        ipAddress: req.ip,
      });

      emitPaymentStatusUpdate({
        paymentRequestId: updatedPayment.paymentRequestId,
        orderId: updatedPayment.orderId,
        eventId: updatedPayment.eventId,
        photographerId: updatedPayment.photographerId,
        status: "PAID",
        reason: `Verified by admin review: ${trimmedReason}`,
        expiresAt: updatedPayment.expiresAt,
        paidAt: updatedPayment.paidAt,
      });

      return res.status(200).json({
        success: true,
        message: "Transaction manually approved and order unlocked",
        transaction: tx,
        payment: updatedPayment,
      });
    }

    // REJECT decision
    const now = new Date();
    tx.processingStatus = "MANUALLY_REJECTED";
    tx.review = {
      reviewedBy: req.user.photographerId,
      decision: "REJECT",
      reason: trimmedReason,
      reviewedAt: now,
    };
    await tx.save();

    if (targetPaymentId) {
      const payment = await Payment.findOneAndUpdate(
        {
          paymentRequestId: targetPaymentId,
          status: { $ne: "PAID" },
        },
        {
          $set: {
            status: "REJECTED",
            "verificationSummary.reason": `Admin review rejected: ${trimmedReason}`,
            "verificationSummary.manualReview": true,
          },
        },
        { returnDocument: "after" }
      );
      if (payment) {
        await Order.updateOne(
          { orderId: payment.orderId, status: { $ne: "PAID" } },
          { $set: { status: "REJECTED" } }
        );
        emitPaymentStatusUpdate({
          paymentRequestId: payment.paymentRequestId,
          orderId: payment.orderId,
          eventId: payment.eventId,
          photographerId: payment.photographerId,
          status: "REJECTED",
          reason: `Rejected after review: ${trimmedReason}`,
          expiresAt: payment.expiresAt,
        });
      }
    }

    await recordAuditLog({
      action: "MANUAL_REVIEW_ACTION",
      actorType: "admin",
      actorId: req.user.photographerId,
      targetType: "BankTransaction",
      targetId: tx.transactionRecordId,
      photographerId: tx.photographerId || "",
      details: {
        decision: "REJECT",
        reason: trimmedReason,
        paymentRequestId: targetPaymentId || null,
      },
      ipAddress: req.ip,
    });

    return res.status(200).json({
      success: true,
      message: "Transaction marked as manually rejected",
      transaction: tx,
    });
  } catch {
    return res.status(500).json({
      success: false,
      message: "Manual review action failed",
    });
  }
});

export default router;
