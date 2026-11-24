
import express from "express";
import Payment from "../models/Payment.js";
import Photo from "../models/Photo.js";

const router = express.Router();

// Get photos unlocked by a payment
router.get("/unlocked/:paymentRequestId", async (req, res) => {
  try {
    const { paymentRequestId } = req.params;

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

    // Allow access only after successful payment verification
    if (payment.status !== "paid") {
      return res.status(403).json({
        success: false,
        message: "Payment not completed. Photos are locked.",
      });
    }

    // Find only the photos selected in this payment
    const photos = await Photo.find({
      eventId: payment.eventId,
      photoId: { $in: payment.selectedPhotoIds },
      isActive: true,
    }).select("-__v");

    return res.status(200).json({
      success: true,
      message: "Unlocked photos retrieved successfully",
      guestId: payment.guestId,
      eventId: payment.eventId,
      count: photos.length,
      photos,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

export default router;
