
import express from "express";
import Payment from "../models/Payment.js";
import Photo from "../models/Photo.js";
import Event from "../models/Event.js";

const router = express.Router();

// Add a new photo to an event
router.post("/add", async (req, res) => {
  try {
    const { eventId, photoUrl } = req.body;

    if (!eventId || !photoUrl) {
      return res.status(400).json({
        success: false,
        message: "Event ID and Photo URL are required",
      });
    }

    // Check image URL format
    try {
      const parsedUrl = new URL(photoUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Invalid URL protocol");
      }
    } catch {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid image URL",
      });
    }

    // Check whether event exists
    const event = await Event.findOne({ eventId });

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Generate next photo ID for this event
    const lastPhoto = await Photo.findOne({ eventId })
      .sort({ photoId: -1 });

    const nextPhotoId = lastPhoto
      ? lastPhoto.photoId + 1
      : 1;

    const newPhoto = await Photo.create({
      photoId: nextPhotoId,
      eventId,
      photoUrl,
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: "Photo added successfully",
      photo: newPhoto,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Get all active photos of a particular event
router.get("/event/:eventId", async (req, res) => {
  try {
    const { eventId } = req.params;

    const photos = await Photo.find({
      eventId,
      isActive: true,
    }).select("-__v");

    return res.status(200).json({
      success: true,
      eventId,
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

// Get photos unlocked by a payment
router.get("/unlocked/:paymentRequestId", async (req, res) => {
  try {
    const { paymentRequestId } = req.params;

    const payment = await Payment.findOne({
      paymentRequestId,
    });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment request not found",
      });
    }

    if (payment.status !== "paid") {
      return res.status(403).json({
        success: false,
        message: "Payment not completed. Photos are locked.",
      });
    }

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
