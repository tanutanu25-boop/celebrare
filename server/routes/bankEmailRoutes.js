
import express from "express";
import Payment from "../models/Payment.js";
import Photographer from "../models/Photographer.js";

const router = express.Router();

router.post("/demo", async (req, res) => {
  try {
    // Demo mode must be explicitly enabled
    if (process.env.DEMO_MODE !== "true") {
      return res.status(403).json({
        success: false,
        message: "Demo mode is disabled",
      });
    }

    const {
      transactionId,
      amount,
      recipientUpiId,
      status,
      paymentRequestId,
    } = req.body;

    if (
      !transactionId ||
      !recipientUpiId ||
      !paymentRequestId ||
      amount === undefined ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) <= 0 ||
      status !== "SUCCESS"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid demo transaction details",
      });
    }

    // Accept fictional demo transaction IDs only
    if (!transactionId.startsWith("DEMO-")) {
      return res.status(400).json({
        success: false,
        message: "Only fictional DEMO transactions are allowed",
      });
    }

    const payment = await Payment.findOne({ paymentRequestId });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment request not found",
      });
    }

    if (payment.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: `Payment is already ${payment.status}`,
      });
    }

    if (new Date(payment.expiresAt) <= new Date()) {
      await Payment.updateOne(
        { paymentRequestId, status: "pending" },
        { $set: { status: "expired" } }
      );

      return res.status(410).json({
        success: false,
        message: "Payment request has expired",
      });
    }

    if (Number(payment.amount) !== Number(amount)) {
      return res.status(400).json({
        success: false,
        message: "Amount does not match",
      });
    }

    const photographer = await Photographer.findOne({
      photographerId: payment.photographerId,
    });

    if (
      !photographer ||
      photographer.upiId.toLowerCase() !== recipientUpiId.toLowerCase()
    ) {
      return res.status(400).json({
        success: false,
        message: "Recipient UPI ID does not match",
      });
    }

    // Atomically update only a pending, unexpired request
    const updatedPayment = await Payment.findOneAndUpdate(
      {
        paymentRequestId,
        status: "pending",
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          status: "paid",
          transactionId,
        },
      },
      { new: true }
    );

    if (!updatedPayment) {
      return res.status(409).json({
        success: false,
        message: "Payment could not be updated",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Demo payment successfully matched",
      verified: false,
      demoStatus: "paid",
      paymentRequestId,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate demo transaction ID",
      });
    }

    console.error("Demo verification error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

export default router;
