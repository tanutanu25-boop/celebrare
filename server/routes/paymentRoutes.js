
import express from "express";
import {
  randomUUID,
  createHmac,
  timingSafeEqual,
} from "crypto";

import Payment from "../models/Payment.js";
import Photographer from "../models/Photographer.js";
import Event from "../models/Event.js";

const router = express.Router();

// ========================================
// 1. Create Payment Request
// ========================================
router.post("/create", async (req, res) => {
  try {
    const {
      photographerId,
      eventId,
      guestId,
      amount,
      selectedPhotoIds,
    } = req.body;

    // Validate input
    if (
      !photographerId ||
      !eventId ||
      !guestId ||
      typeof guestId !== "string" ||
      !guestId.trim() ||
      !Number.isInteger(amount) ||
      amount <= 0 ||
      !Array.isArray(selectedPhotoIds) ||
      selectedPhotoIds.length === 0 ||
      !selectedPhotoIds.every(
        (id) => Number.isInteger(id) && id > 0
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid payment details are required",
      });
    }

    // Find photographer
    const photographer = await Photographer.findOne({
      photographerId,
    });

    if (!photographer) {
      return res.status(404).json({
        success: false,
        message: "Photographer not found",
      });
    }

    // Find event belonging to this photographer
    const event = await Event.findOne({
      eventId,
      photographerId,
    });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found for this photographer",
      });
    }

    // Generate unique payment request ID
    const paymentRequestId = randomUUID();

    // Set expiry to 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    const payment = await Payment.create({
      paymentRequestId,
      photographerId,
      eventId,
      guestId: guestId.trim(),
      amount,
      selectedPhotoIds,
      expiresAt,
      status: "pending",
    });

    // Generate UPI payment link
    const upiPaymentLink =
      `upi://pay?pa=${encodeURIComponent(photographer.upiId)}` +
      `&pn=${encodeURIComponent(photographer.name)}` +
      `&am=${amount}` +
      `&cu=INR` +
      `&tn=${encodeURIComponent(paymentRequestId)}`;

    return res.status(201).json({
      success: true,
      message: "Demo payment request created",
      payment: {
        paymentRequestId: payment.paymentRequestId,
        photographerId: payment.photographerId,
        eventId: payment.eventId,
        guestId: payment.guestId,
        amount: payment.amount,
        selectedPhotoIds: payment.selectedPhotoIds,
        status: payment.status,
        expiresAt: payment.expiresAt,
        upiPaymentLink,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ========================================
// 2. Check Payment Status and Expiry
// ========================================
router.get("/:paymentRequestId", async (req, res) => {
  try {
    const { paymentRequestId } = req.params;

    // Expire payment if 5 minutes have passed
    await Payment.findOneAndUpdate(
      {
        paymentRequestId,
        status: "pending",
        expiresAt: { $lte: new Date() },
      },
      {
        $set: { status: "expired" },
      }
    );

    const payment = await Payment.findOne({
      paymentRequestId,
    }).select("-__v");

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment request not found",
      });
    }

    return res.status(200).json({
      success: true,
      payment: {
        paymentRequestId: payment.paymentRequestId,
        photographerId: payment.photographerId,
        eventId: payment.eventId,
        guestId: payment.guestId,
        amount: payment.amount,
        selectedPhotoIds: payment.selectedPhotoIds,
        status: payment.status,
        expiresAt: payment.expiresAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// ========================================
// 3. Verify Trusted Demo Webhook
// ========================================
router.post("/webhook/verify", async (req, res) => {
  try {
    const secret = process.env.BANK_WEBHOOK_SECRET;
    const signature = req.headers["x-webhook-signature"];

    // Debugging logs
    console.log("----- WEBHOOK DEBUG -----");
    console.log("Secret loaded:", Boolean(secret));
    console.log("Signature received:", Boolean(signature));
    console.log("Raw body received:", Boolean(req.rawBody));
    console.log("Raw body length:", req.rawBody?.length);
    console.log("-------------------------");

    // Check authentication details
    if (!secret || !signature || !req.rawBody) {
      return res.status(401).json({
        success: false,
        message: "Webhook authentication details missing",
      });
    }

    // Generate expected HMAC signature
    const expectedSignature =
      "sha256=" +
      createHmac("sha256", secret)
        .update(req.rawBody)
        .digest("hex");

    const receivedBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    // Verify signature
    if (
      receivedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(receivedBuffer, expectedBuffer)
    ) {
      console.log("Webhook signature verification failed");

      return res.status(401).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    console.log("Webhook signature verified successfully");

    const {
      paymentRequestId,
      transactionId,
      photographerId,
      amount,
    } = req.body;

    // Validate transaction details
    if (
      typeof paymentRequestId !== "string" ||
      typeof transactionId !== "string" ||
      !transactionId.trim() ||
      typeof photographerId !== "string" ||
      !Number.isInteger(amount) ||
      amount <= 0
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid transaction details",
      });
    }

    // Find payment
    const payment = await Payment.findOne({
      paymentRequestId,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment request not found",
      });
    }

    // Check photographer and amount
    if (
      payment.photographerId !== photographerId ||
      payment.amount !== amount
    ) {
      return res.status(400).json({
        success: false,
        message: "Photographer or amount does not match",
      });
    }

    // Check expiry
    if (payment.expiresAt <= new Date()) {
      if (payment.status === "pending") {
        payment.status = "expired";
        await payment.save();
      }

      return res.status(400).json({
        success: false,
        message: "Payment request has expired",
      });
    }

    // Check payment status
    if (payment.status !== "pending") {
      return res.status(409).json({
        success: false,
        message: "Payment is not pending",
      });
    }

    // Atomically update payment
    const updatedPayment = await Payment.findOneAndUpdate(
      {
        paymentRequestId,
        photographerId,
        amount,
        status: "pending",
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          status: "paid",
          transactionId: transactionId.trim(),
        },
      },
      { new: true }
    );

    if (!updatedPayment) {
      return res.status(409).json({
        success: false,
        message: "Payment could not be verified",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Demo webhook accepted",
      payment: {
        paymentRequestId: updatedPayment.paymentRequestId,
        photographerId: updatedPayment.photographerId,
        eventId: updatedPayment.eventId,
        guestId: updatedPayment.guestId,
        transactionId: updatedPayment.transactionId,
        status: updatedPayment.status,
      },
    });
  } catch (error) {
    // Duplicate transaction ID
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "Duplicate transaction ID",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
